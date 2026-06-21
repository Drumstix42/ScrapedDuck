const fs = require('fs');
const ical = require('ical-generator');

function main()
{
    var events = JSON.parse(fs.readFileSync("./files/events.min.json"));

    fs.readdir("files/temp", function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }

        files.forEach(f =>
        {
            var data = JSON.parse(fs.readFileSync("./files/temp/" + f));

            events.forEach(e =>
            {
                if (e.eventID == data.id)
                {
                    // add always generic data as 'generic' block in 'extraData' (available for all possible events)
                    if (data.type == "generic")
                    {
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
                        e.extraData.generic = data.data;
                    }
                    // add event specific extra data. Block named as event type name
                    if (data.type == "research-breakthrough")
                    {
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
                        e.extraData.breakthrough = data.data;
                    }
                    else if (data.type == "pokemon-spotlight-hour")
                    {
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
                        e.extraData.spotlight = data.data
                    }
                    else if (data.type == "community-day")
                    {
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
                        e.extraData.communityday = data.data
                    }
                    else if (data.type == "raid-battles")
                    {
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
                        e.extraData.raidbattles = data.data
                    }
                    else if (data.type == "event")
                    {
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
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
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
                        e.extraData.promocodes = data.data
                    }
                    else if (data.type == "season")
                    {
                        if (e.extraData === null) {
                            e.extraData = {};
                        }
                        e.extraData.season = data.data
                    }
                }
            });
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

        // ensure the timestamps are all in zulu time
        const startZulu = new Date(e.start).toISOString();
        const endZulu = new Date(e.end).toISOString();
        const calEventTitle = `${e.heading} — ${e.name}`

        const calEvent = {
            start: startZulu,
            end: endZulu,
            id: `scraped-duck-${e.eventID}`,
            summary: calEventTitle,
            description: `<a href="${e.link}">${e.name}</a>`,
            categories: [{ name: e.heading }],
            url: e.link,
            organizer: { name: "LeekDuck c/o ScrapedDuck" },
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
