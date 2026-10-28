const fs = require('fs');
const jsd = require('jsdom');
const { JSDOM } = jsd;
const https = require('https');
const eventtype = require('../eventtype');
const bonuses = require('../bonuses');
const spawns = require('../spawns');
const section = require('../section');

/**
 * Create temporary json file (<event-id>_generic.json) for each event with generic event data.
 *
 * @param {string} url leekduck.com url for eventspecfic website.
 * @param {string} id unique event id string.
 * @param {dict} bkp parsed event_min.json. Used for get fallback data, if anything goes wrong.
 * @return {Promise} -
 */
function get(url, id, bkp)
{
    return new Promise(resolve => {
        JSDOM.fromURL(url, {
        })
        .then((dom) => {

            var generic = {
                hasSpawns: false,
                hasFieldResearchTasks: false
            };
            // For events with specific spawns, there is a h2 heading element with id 'spawns'
            if (dom.window.document.getElementById('spawns') !== null)
                generic.hasSpawns = true;
            // For events with specific field research tasks, there is a h2 heading element with id 'field-research-tasks'
            if (dom.window.document.getElementById('field-research-tasks') !== null)
                generic.hasFieldResearchTasks = true;

            // The event page tags every type the event belongs to (e.g. "event" + "location-specific"),
            // whereas the events list only shows the primary one
            var eventTypes = [...dom.window.document.querySelectorAll(".page-tags .tag")]
                .map(tag => eventtype.normalize([...tag.classList].filter(c => c != "tag").join(" ")))
                .filter(type => type);

            // Some pages describe an open Pokémon pool in words instead of listing it, e.g. "All
            // Dynamax Pokémon that have previously appeared in Pokémon GO may appear in Max Battles".
            // Wild Encounters text next to a list is already in that list's spawn group.
            var maxBattlesText = section.paragraphText(section.subsection(dom.window.document, "max-battles"));
            var wildEncounters = section.subsection(dom.window.document, "wild-encounters");
            var wildEncountersText = wildEncounters.some(el => el.classList.contains("pkmn-list-flex"))
                ? null
                : section.paragraphText(wildEncounters);

            // The "Bonuses" and "Spawns" sections are shared by all event types, so they're parsed here rather than per type
            writeTempFile(id, {
                data: generic,
                eventTypes: eventTypes,
                bonuses: bonuses.parse(dom.window.document),
                spawns: spawns.parse(dom.window.document),
                maxbattles: maxBattlesText ? { description: maxBattlesText } : undefined,
                spawnsDescription: wildEncountersText || undefined
            });
        }).catch(_err =>
        {
            // on error, use the matching event from the backup data as fallback
            var backup = bkp.find(e => e.eventID == id);
            if (backup?.extraData?.generic || backup?.eventTypes || backup?.extraData?.bonuses || backup?.extraData?.spawns)
            {
                writeTempFile(id, {
                    data: backup.extraData?.generic,
                    eventTypes: backup.eventTypes,
                    bonuses: backup.extraData?.bonuses,
                    spawns: backup.extraData?.spawns,
                    maxbattles: backup.extraData?.maxbattles,
                    spawnsDescription: backup.extraData?.spawnsDescription
                });
            }
        });
    })
}

function writeTempFile(id, fields)
{
    fs.writeFile(`files/temp/${id}_generic.json`, JSON.stringify({ id: id, type: "generic", ...fields }), err => {
        if (err) {
            console.error(err);
            return;
        }
    });
}

module.exports = { get }