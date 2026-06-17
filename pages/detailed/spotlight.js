const fs = require('fs');
const jsd = require('jsdom');
const { JSDOM } = jsd;

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
                    spotlight.list.push({ name: spotlight.name, canBeShiny: null, image: "" });
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