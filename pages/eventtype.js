// LeekDuck has used a few different slugs for the same event type over the years
const ALIASES = {
    "ticketed": "ticketed-event",
    "rocket-takeover": "go-rocket-takeover"
};

/**
 * Normalize a LeekDuck event type slug (taken from a CSS class) to its canonical form.
 *
 * @param {string} type raw event type slug, e.g. "pokémon-go-fest".
 * @return {string} canonical slug, e.g. "pokemon-go-fest".
 */
function normalize(type)
{
    type = type.replace(/é/g, "e");
    return ALIASES[type] || type;
}

module.exports = { normalize }
