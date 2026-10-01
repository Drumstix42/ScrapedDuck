const fs = require('fs');
const ical = require('ical-generator');
const eventtype = require('./pages/eventtype');

function main()
{
    var events = JSON.parse(fs.readFileSync("./files/events.min.json"));

    fs.readdir("files/temp", function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }

        var eventsByID = new Map(events.map(e => [e.eventID, e]));

        files.forEach(f =>
        {
            var data = JSON.parse(fs.readFileSync("./files/temp/" + f));
            var e = eventsByID.get(data.id);
            if (!e)
                return;

            if (e.extraData === null) {
                e.extraData = {};
            }

            // add always generic data as 'generic' block in 'extraData' (available for all possible events)
            if (data.type == "generic")
            {
                if (data.data) {
                    e.extraData.generic = data.data;
                }
                if (data.eventTypes) {
                    e.eventTypes = (e.eventTypes || []).concat(data.eventTypes);
                }
            }
            // add event specific extra data. Block named as event type name
            else if (data.type == "research-breakthrough")
            {
                e.extraData.breakthrough = data.data;
            }
            else if (data.type == "pokemon-spotlight-hour")
            {
                e.extraData.spotlight = data.data
            }
            else if (data.type == "community-day")
            {
                e.extraData.communityday = data.data
            }
            else if (data.type == "raid-battles")
            {
                e.extraData.raidbattles = data.data
            }
            else if (data.type == "event")
            {
                // Merge event data directly into extraData (flattened structure)
                if (data.data.raidSchedule) {
                    e.extraData.raidSchedule = data.data.raidSchedule;
                }
                if (data.data.raidbattles) {
                    e.extraData.raidbattles = data.data.raidbattles;
                }
                if (data.data.spotlightSchedule) {
                    e.extraData.spotlightSchedule = data.data.spotlightSchedule;
                }
                if (data.data.bonuses) {
                    e.extraData.bonuses = data.data.bonuses;
                }
            }
            else if (data.type == "promo-codes")
            {
                e.extraData.promocodes = data.data
            }
            else if (data.type == "season")
            {
                e.extraData.season = data.data
            }
        });

        // eventTypes always leads with the primary eventType, without duplicates. Normalizing again
        // here also covers events that came from backup data scraped before an alias was added.
        events.forEach(e => {
            e.eventType = eventtype.normalize(e.eventType);
            e.eventTypes = [...new Set([e.eventType, ...(e.eventTypes || [])].map(eventtype.normalize))];
        });

        fs.writeFile('files/events.json', JSON.stringify(events, null, 4), err => {
            if (err) {
                console.error(err);
                return;
            }
        });
        fs.writeFile('files/events.min.json', JSON.stringify(events), err => {
            if (err) {
                console.error(err);
                return;
            }
        });

        writeSeasonFile(events);

        generateCalendars(events);

        fs.rm("files/temp", { recursive: true }, (err) => {
            if (err) { throw err; }
        });
    });
}

/**
 * Write a standalone season bonuses file containing every season-type event
 * (self-contained, with identifying metadata), sorted by start date. Emitting
 * all seasons lets consumers pick the active one using the viewer's own local
 * time — the only timezone the season's start/end timestamps are meaningful in.
 */
function writeSeasonFile(events) {
    var seasons = events
        .filter(e => e.eventType == "season" && e.extraData != null && e.extraData.season)
        .sort((a, b) => (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0))
        .map(e => ({
            name: e.name,
            eventID: e.eventID,
            link: e.link,
            start: e.start,
            end: e.end,
            note: e.extraData.season.note,
            dailyBonuses: e.extraData.season.dailyBonuses,
            seasonBonuses: e.extraData.season.seasonBonuses
        }));

    fs.writeFile('files/season.json', JSON.stringify(seasons, null, 4), err => {
        if (err) {
            console.error(err);
            return;
        }
    });
    fs.writeFile('files/season.min.json', JSON.stringify(seasons), err => {
        if (err) {
            console.error(err);
            return;
        }
    });
}

function generateCalendars(events) {
    const leekDuckFavIconUrl = "https://leekduck.com/assets/img/favicon/favicon-16x16.png";
    const generatorName = "ScrapedDuck";
    const generatorUrl = "https://github.com/bigfoott/ScrapedDuck";
    const icalMeta = [
        ["x-origin", "https://leekduck.com/events/"],
        ["x-generator", generatorName],
        ["x-generator-url", generatorUrl],
    ];

    const icals = new Map();
    icals.set("all", ical.default({ name: "Pokémon Go — All Events", description: "All Pokémon Go events.", x: icalMeta }));

    events.forEach(e => {

        if (!icals.has(e.eventType)) {
            icals.set(e.eventType, ical.default({ name: `Pokémon Go — ${e.heading}`, description: `Pokémon Go ${e.heading} events.`, x: icalMeta }));
        }

        const calAll = icals.get("all");
        const calType = icals.get(e.eventType);

        // LeekDuck gives local-time events (same wall clock in every timezone) without a "Z",
        // and fixed-instant events (e.g. GBL, Wild Area) in UTC with a "Z". Emit local-time
        // events as floating times so they don't shift by the runner's timezone.
        const isLocalTime = v => typeof v == "string" && !v.endsWith("Z");
        const floating = isLocalTime(e.start) && isLocalTime(e.end);
        // ical-generator writes a floating Date's UTC fields, so read the wall clock as UTC
        const toDate = v => floating ? new Date(v + "Z") : new Date(v);
        const calEventTitle = `${e.heading} — ${e.name}`

        const calEvent = {
            start: toDate(e.start),
            end: toDate(e.end),
            floating,
            id: `scraped-duck-${e.eventID}`,
            summary: calEventTitle,
            description: `<a href="${e.link}">${e.name}</a>`,
            categories: [{ name: e.heading }],
            url: e.link,
            x: [
                ["IMAGE", e.image],
                ["X-GOOGLE-CALENDAR-CONTENT-TITLE", calEventTitle],
                ["X-GOOGLE-CALENDAR-CONTENT-ICON", leekDuckFavIconUrl],
                ["X-GOOGLE-CALENDAR-CONTENT-URL", e.image],
                ["X-GOOGLE-CALENDAR-CONTENT-TYPE", "image/*"],
            ],
        };

        calAll.createEvent(calEvent);
        calType.createEvent(calEvent);
    });


    if (!fs.existsSync('files/calendars'))
        fs.mkdirSync('files/calendars');

    for (const [key, cal] of icals) {
        cal.prodId({ company: generatorName, product: "Scraped LeekDuck Events", language: "EN" })

        fs.writeFile(`files/calendars/${key}.ics`, cal.toString(), err => {
            if (err) {
                console.error(err);
                return;
            }
        });
    }
}

try
{
    main();
}
catch (e)
{
    console.error("ERROR: " + e);
    process.exit(1);
}
