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
 * @param {Document} document event page document.
 * @return {Array} bonus groups: { title, description, startTime, endTime, items: [{ text, image }], notes }
 */
function parse(document)
{
    var groups = [];
    var header = document.querySelector('h2#bonuses');
    if (!header)
        return groups;

    var elements = [];
    for (var el = header.nextElementSibling; el; el = el.nextElementSibling)
    {
        if (el.tagName == "H2" && el.classList.contains("event-section-header"))
            break;
        if (el.classList.contains("author-box"))
            break;
        elements.push(el);
    }

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
                    current.items.push({ text: text.textContent.trim(), image: image ? image.src : "" });
            });

            if (current.items.length > 0)
                groups.push(current);
        }
        else if (/^H[234]$/.test(el.tagName) || el.tagName == "HR")
        {
            current = null;
            title = el.tagName == "HR" ? null : el.textContent.trim();
        }
        else if (el.tagName == "P" || el.tagName == "H5" || el.tagName == "H6")
        {
            textLines(el).forEach(line =>
            {
                // footnotes always belong to the list above them
                if (current && (line.startsWith("*") || el.tagName != "P"))
                    current.notes.push(line);
                // after a list, a paragraph only introduces the next list if one follows
                // before the next heading/HR, or if it reads like an introduction
                else if (current && !INTRO.test(line) && !listFollows(elements, i))
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

// Text of a paragraph, split on <br> into separate lines (e.g. stacked "*" and "**" footnotes)
function textLines(el)
{
    var clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    return clone.textContent.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(s => s);
}

// Whether another bonus-list comes after elements[i] before the next heading/HR
function listFollows(elements, i)
{
    for (var j = i + 1; j < elements.length; j++)
    {
        if (elements[j].classList.contains("bonus-list"))
            return true;
        if (/^H[234]$/.test(elements[j].tagName) || elements[j].tagName == "HR")
            return false;
    }
    return false;
}

module.exports = { parse }
