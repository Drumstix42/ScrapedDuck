/**
 * Elements of an event page section, from its "event-section-header" H2 (e.g. h2#bonuses)
 * up to the next section header or the author box.
 *
 * @param {Document} document event page document.
 * @param {string} id section header id ("bonuses", "spawns", ...).
 * @return {Array} elements in the section; [] when the page has no such section
 */
function elements(document, id)
{
    var elements = [];
    var header = document.querySelector('h2#' + id);
    if (!header)
        return elements;

    for (var el = header.nextElementSibling; el; el = el.nextElementSibling)
    {
        if (el.tagName == "H2" && el.classList.contains("event-section-header"))
            break;
        if (el.classList.contains("author-box"))
            break;
        elements.push(el);
    }
    return elements;
}

// Sub-headings and HRs split a section into groups; the section's own header is never inside it
function isBoundary(el)
{
    return /^H[234]$/.test(el.tagName) || el.tagName == "HR";
}

// Text of a paragraph, split on <br> into separate lines (e.g. stacked "*" and "**" footnotes)
function textLines(el)
{
    var clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    return clone.textContent.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(s => s);
}

/**
 * Elements directly under a sub-heading (e.g. h2#max-battles inside "Features"), up to the next
 * heading or HR, so a nested "Special Background" H3 is left out.
 *
 * @param {Document} document event page document.
 * @param {string} id sub-heading id ("max-battles", "wild-encounters", ...).
 * @return {Array} elements under the heading; [] when the page has no such heading
 */
function subsection(document, id)
{
    var elements = [];
    var header = document.querySelector('h2#' + id);
    if (!header)
        return elements;

    for (var el = header.nextElementSibling; el && !isBoundary(el) && !el.classList.contains("author-box"); el = el.nextElementSibling)
        elements.push(el);
    return elements;
}

// Text of the paragraphs among the given elements, joined into one line; null when there is none
function paragraphText(elements)
{
    return elements.filter(el => el.tagName == "P").flatMap(textLines).join(" ") || null;
}

// Whether another list with the given class comes after elements[i] before the next heading/HR
function listFollows(elements, i, listClass)
{
    for (var j = i + 1; j < elements.length; j++)
    {
        if (elements[j].classList.contains(listClass))
            return true;
        if (isBoundary(elements[j]))
            return false;
    }
    return false;
}

module.exports = { elements, subsection, isBoundary, textLines, paragraphText, listFollows }
