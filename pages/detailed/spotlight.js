const fs = require('fs');
const jsd = require('jsdom');
const { JSDOM } = jsd;

// Matches the curly/straight/backtick apostrophe variants LeekDuck mixes between
// the description text and the Spawns pkmn-list-item markup (e.g. "Friede's" vs "Friede’s").
function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/[‘’ʼ`]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// Pokemon images for costume/special-form spotlights live in the "Spawns" section as
// <ul class="pkmn-list-flex"><li class="pkmn-list-item"><div class="pkmn-list-img"><img .../></div>
// <img class="shiny-icon" .../><div class="pkmn-name">...</div></li></ul>
function parsePokemonFromElement(pokemonElement) {
    var nameElement = pokemonElement.querySelector(':scope > .pkmn-name');
    var imageElement = pokemonElement.querySelector(':scope > .pkmn-list-img > img');

    if (!nameElement || !imageElement) return null;

    return {
        name: nameElement.textContent.trim(),
        image: imageElement.src,
        canBeShiny: pokemonElement.querySelector(':scope > .shiny-icon') !== null
    };
}

function get(url, id, bkp)
{
    return new Promise(resolve => {
        JSDOM.fromURL(url, {
        })
        .then((dom) => {

            var spotlight = {
                name: "",
                canBeShiny: null,
                image: "",
                bonus: "",
                list: []
            };

            var pokemonLookup = {};
            dom.window.document.querySelectorAll('.pkmn-list-flex > .pkmn-list-item').forEach(item => {
                var pokemon = parsePokemonFromElement(item);
                if (pokemon) {
                    pokemonLookup[normalizeName(pokemon.name)] = pokemon;
                }
            });

            // New page format: the featured Pokémon and bonus are embedded in
            // plain text paragraphs inside .event-description:
            // <p><strong>June 18</strong>: The featured Pokémon is <strong>Swinub</strong>
            //    and the special bonus is <strong>2× Transfer Candy</strong>.</p>
            const paragraphs = dom.window.document.querySelectorAll('.event-description p');
            paragraphs.forEach(p => {
                const text = p.textContent;
                if (!text.includes('featured Pok')) return;

                const strongs = p.querySelectorAll('strong');
                // strongs[0] = date, strongs[1] = pokemon name, strongs[2] = bonus
                // If no date strong, strongs[0] = pokemon name, strongs[1] = bonus
                if (strongs.length >= 3) {
                    spotlight.name = strongs[1].textContent.trim();
                    spotlight.bonus = strongs[2].textContent.trim();
                } else if (strongs.length === 2) {
                    spotlight.name = strongs[0].textContent.trim();
                    spotlight.bonus = strongs[1].textContent.trim();
                }

                if (spotlight.name) {
                    var details = pokemonLookup[normalizeName(spotlight.name)] || {
                        name: spotlight.name,
                        image: "",
                        canBeShiny: null
                    };
                    spotlight.image = details.image;
                    spotlight.canBeShiny = details.canBeShiny;
                    spotlight.list.push({ name: spotlight.name, canBeShiny: details.canBeShiny, image: details.image });
                }
            });

            fs.writeFile(`files/temp/${id}.json`, JSON.stringify({ id: id, type: "pokemon-spotlight-hour", data: spotlight }), err => {
                if (err) {
                    console.error(err);
                    return;
                }
            });
        }).catch(_err =>
        {
            for (var i = 0; i < bkp.length; i++)
            {
                if (bkp[i].eventID == id)
                {
                    fs.writeFile(`files/temp/${id}.json`, JSON.stringify({ id: id, type: "pokemon-spotlight-hour", data: bkp[i].extraData.spotlight }), err => {
                        if (err) {
                            console.error(err); 
                            return;
                        }
                    });
                }
            }
        });
    })
}

module.exports = { get }