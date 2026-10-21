const fs = require('fs');
const jsd = require('jsdom');
const { JSDOM } = jsd;
const https = require('https');
const eventtype = require('../eventtype');
const bonuses = require('../bonuses');
const spawns = require('../spawns');

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

            // The "Bonuses" and "Spawns" sections are shared by all event types, so they're parsed here rather than per type
            writeTempFile(id, generic, eventTypes, bonuses.parse(dom.window.document), spawns.parse(dom.window.document));
        }).catch(_err =>
        {
            // on error, use the matching event from the backup data as fallback
            var backup = bkp.find(e => e.eventID == id);
            if (backup?.extraData?.generic || backup?.eventTypes || backup?.extraData?.bonuses || backup?.extraData?.spawns)
            {
                writeTempFile(id, backup.extraData?.generic, backup.eventTypes, backup.extraData?.bonuses, backup.extraData?.spawns);
            }
        });
    })
}

function writeTempFile(id, generic, eventTypes, bonuses, spawns)
{
    fs.writeFile(`files/temp/${id}_generic.json`, JSON.stringify({ id: id, type: "generic", data: generic, eventTypes: eventTypes, bonuses: bonuses, spawns: spawns }), err => {
        if (err) {
            console.error(err);
            return;
        }
    });
}

module.exports = { get }