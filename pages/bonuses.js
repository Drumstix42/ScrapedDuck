const section = require('./section');
const schedule = require('./schedule');

// "From 2:00 p.m. to 5:00 p.m." / "between 10:00 a.m. and 6:00 p.m." time windows some bonus groups are limited to
const TIME_WINDOW = /(?:from|between)\s+([\d:]+\s+[ap]\.m\.)\s+(?:to|and)\s+([\d:]+\s+[ap]\.m\.)/i;

// Paragraphs like "Unlock the following bonuses by reaching..." introduce the next bonus list
const INTRO = /following bonus|:$/i;

/**
 * Parse the "Bonuses" section of a LeekDuck event page into bonus groups. Each .bonus-list in
 * the section becomes one group; the layout around the lists varies a lot between event types
 * (sub-headings per tier/ticket, HR separators, time windows before or after the list, footnotes),
 * so text is assigned by position:
 *  - title: the nearest sub-heading (H2-H4) above the list
 *  - description: paragraphs leading up to the list
 *  - notes: footnotes ("*...", H5) and paragraphs following the list
 *
 * Bonus-lists outside the Bonuses section (promo code rewards, GO Pass milestones in their own
 * section, ticket add-ons in "Sales", etc.) are intentionally ignored.
 *
 * Items whose own text states a time window ("Increased chance to encounter Minior from 5:00 p.m.
 * to 9:00 p.m. local time each day") get it as their schedule; the group's startTime/endTime would
 * wrongly limit every other bonus in the list to it.
 *
 * @param {Document} document event page document.
 * @return {Array} bonus groups: { title, description, startTime, endTime, items: [{ text, image, schedule }], notes }
 */
function parse(document)
{
    var groups = [];
    var elements = section.elements(document, "bonuses");

    var title = null;
    var pending = [];       // paragraphs introducing the next bonus list
    var current = null;     // last group created since the previous heading/HR

    elements.forEach((el, i) =>
    {
        if (el.classList.contains("bonus-list"))
        {
            var description = pending.join("\n") || null;
            var time = (description || "").match(TIME_WINDOW);
            current = {
                title: title,
                description: description,
                startTime: time ? time[1] : null,
                endTime: time ? time[2] : null,
                items: [],
                notes: []
            };
            pending = [];

            el.querySelectorAll(':scope > .bonus-item').forEach(item =>
            {
                var text = item.querySelector(':scope > .bonus-text');
                var image = item.querySelector(':scope > .item-circle > img');
                if (text)
                {
                    text = text.textContent.trim();
                    current.items.push({ text: text, image: image ? image.src : "", schedule: schedule.parse(text) });
                }
            });

            if (current.items.length > 0)
                groups.push(current);
        }
        else if (section.isBoundary(el))
        {
            current = null;
            title = el.tagName == "HR" ? null : el.textContent.trim();
        }
        else if (el.tagName == "P" || el.tagName == "H5" || el.tagName == "H6")
        {
            section.textLines(el).forEach(line =>
            {
                // footnotes always belong to the list above them
                if (current && (line.startsWith("*") || el.tagName != "P"))
                    current.notes.push(line);
                // after a list, a paragraph only introduces the next list if one follows
                // before the next heading/HR, or if it reads like an introduction
                else if (current && !INTRO.test(line) && !section.listFollows(elements, i, "bonus-list"))
                    current.notes.push(line);
                else
                    pending.push(line);
            });
        }
    });

    // time windows are sometimes stated after the list ("These bonuses will be effective ... from X to Y");
    // "*" footnotes are skipped since they only apply to individual bonuses
    groups.forEach(g =>
    {
        if (!g.startTime)
        {
            var time = g.notes.filter(n => !n.startsWith("*")).map(n => n.match(TIME_WINDOW)).find(m => m);
            if (time)
            {
                g.startTime = time[1];
                g.endTime = time[2];
            }
        }
    });

    return groups;
}

module.exports = { parse }
