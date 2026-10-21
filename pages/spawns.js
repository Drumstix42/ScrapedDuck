const section = require('./section');
const schedule = require('./schedule');

// Paragraphs like "The following Pokémon will appear more frequently:" introduce the next list
const INTRO = /following|:$/i;

/**
 * Parse the "Spawns" section of a LeekDuck event page into spawn groups. Each .pkmn-list-flex in
 * the section becomes one group, with text assigned by position like the Bonuses section:
 *  - title: the outermost sub-heading above the list, i.e. the topic ("Mighty Pokémon")
 *  - subtitle: a label heading nested under it ("Solid as Steel Hour")
 *  - description: paragraphs leading up to the list
 *  - notes: paragraphs following the list
 *
 * Nested headings that are dates ("Saturday, November 14") go into schedule instead of the
 * title/subtitle. Otherwise schedule holds the time windows stated in the description, or else
 * the notes ("Minior encounters are more likely from 5:00 p.m. to 9:00 p.m. local time each
 * day."). Windows stated under the group's own sub-heading win over a parent heading's summary
 * ("rotate hourly from 10:00 a.m. to 6:00 p.m." above each habitat's hours). [] means the spawns
 * run for the whole event.
 *
 * @param {Document} document event page document.
 * @return {Array} spawn groups: { title, subtitle, description, schedule, pokemon: [{ name, image, canBeShiny }], notes }
 */
function parse(document)
{
    var groups = [];
    var headingSchedules = [];  // date-heading windows for each group, applied once its notes are known
    var elements = section.elements(document, "spawns");

    var title = null;
    var titleLevel = null;      // heading level of the title; deeper headings are subtitles or dates
    var subtitle = null;
    var subtitleLevel = null;
    var headingSchedule = [];   // windows from the current date heading
    var pending = [];           // paragraphs introducing the next list
    var titleAt = 0;            // index in pending of the first paragraph under the latest heading
    var current = null;         // last group created since the previous heading/HR

    elements.forEach((el, i) =>
    {
        if (el.classList.contains("pkmn-list-flex"))
        {
            current = {
                title: title,
                subtitle: subtitle,
                description: pending.join("\n") || null,
                schedule: pending.slice(titleAt).flatMap(schedule.parse),
                pokemon: [],
                notes: []
            };
            if (current.schedule.length == 0 && headingSchedule.length == 0)
                current.schedule = pending.flatMap(schedule.parse);
            pending = [];
            titleAt = 0;

            el.querySelectorAll(':scope > .pkmn-list-item').forEach(item =>
            {
                var name = item.querySelector(':scope > .pkmn-name');
                var image = item.querySelector(':scope > .pkmn-list-img > img');
                if (name)
                    current.pokemon.push({
                        name: name.textContent.trim(),
                        image: image ? normalizeImage(image.src) : "",
                        canBeShiny: item.querySelector(':scope > .shiny-icon, :scope > .pkmn-list-img > .pokemon-cutout-shiny') !== null
                    });
            });

            if (current.pokemon.length > 0)
            {
                groups.push(current);
                headingSchedules.push(headingSchedule);
            }
        }
        else if (el.tagName == "HR")
        {
            // an HR ends the nested part (a habitat hour, a day); the topic heading still applies
            current = null;
            subtitle = null;
            headingSchedule = [];
        }
        else if (section.isBoundary(el))
        {
            current = null;
            titleAt = pending.length;
            var text = el.textContent.trim();
            var level = Number(el.tagName[1]);
            var dates = schedule.parseHeading(text);

            if (dates.length > 0)
            {
                headingSchedule = dates;
                if (subtitleLevel !== null && level <= subtitleLevel)
                    subtitle = null;
            }
            else if (titleLevel === null || level <= titleLevel)
            {
                title = text;
                titleLevel = level;
                subtitle = null;
                headingSchedule = [];
            }
            else
            {
                subtitle = text;
                subtitleLevel = level;
                headingSchedule = [];
            }
        }
        else if (el.tagName == "P")
        {
            section.textLines(el).forEach(line =>
            {
                // after a list, a paragraph only introduces the next list if one follows
                // before the next heading/HR, or if it reads like an introduction
                if (current && !INTRO.test(line) && !section.listFollows(elements, i, "pkmn-list-flex"))
                    current.notes.push(line);
                else
                    pending.push(line);
            });
        }
    });

    groups.forEach((g, i) =>
    {
        // time windows are sometimes stated after the list instead of before it
        if (g.schedule.length == 0)
            g.schedule = g.notes.filter(n => !n.startsWith("*")).flatMap(schedule.parse);
        g.schedule = withHeading(g.schedule, headingSchedules[i]);
    });

    return merge(groups);
}

// Follow-up lists ("You might also encounter Skarmory!") under the same heading and schedule
// join the list above them; their text is kept in the description/notes
function merge(groups)
{
    var merged = [];
    groups.forEach(g =>
    {
        var last = merged[merged.length - 1];
        if (last && last.title === g.title && last.subtitle === g.subtitle
            && JSON.stringify(last.schedule) === JSON.stringify(g.schedule))
        {
            last.description = [last.description, g.description].filter(d => d).join("\n") || null;
            last.pokemon = last.pokemon.concat(g.pokemon);
            last.notes = last.notes.concat(g.notes);
        }
        else
            merged.push(g);
    });
    return merged;
}

// Combine a group's own time windows with its date heading: times listed under a single-day
// heading happen on that day; a heading with its own times (a date range) is used as-is
function withHeading(windows, heading)
{
    if (heading.length == 0)
        return windows;
    if (windows.length == 0 || heading.length > 1 || !heading[0].allDay || heading[0].startDate != heading[0].endDate)
        return heading;
    return schedule.onDate(windows, heading[0].startDate);
}

function normalizeImage(src)
{
    return src.includes("/assets/") ? "https://cdn.leekduck.com/assets/" + src.split("/assets/")[1] : src;
}

module.exports = { parse }
