// "between 10:00 a.m. and 6:00 p.m." / "(from) 5:00 p.m. to 9:00 p.m." windows within a single line of text;
// habitat hours list bare "10:00 a.m. to 11:00 a.m." lines
const TIME_WINDOW = /(?:between\s+([\d:]+\s+[ap]\.m\.)\s+and|([\d:]+\s+[ap]\.m\.)\s+to)\s+([\d:]+\s+[ap]\.m\.)/ig;

// "Saturday, November 14" / "November 14, 2026"; the weekday is kept as part of the date when present
const DATE = "((?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,\\s+)?"
    + "(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2}(?:,\\s*\\d{4})?)";
const TIME = "([\\d:]+\\s+[ap]\\.m\\.)";

// "October 13 at 10:00 a.m. to October 16 at 10:00 a.m. local time"
const DATE_RANGE_HEADING = new RegExp("^" + DATE + "\\s+at\\s+" + TIME + "\\s+to\\s+" + DATE + "\\s+at\\s+" + TIME + "$", "i");
// "Saturday, November 14", optionally followed by a time window ("Saturday, November 14, 10:00 a.m. to 1:00 p.m.")
const DAY_HEADING = new RegExp("^" + DATE + "(?:[,:]?\\s+(.*))?$", "i");

function timeWindow(startDate, startTime, endDate, endTime)
{
    return {
        startDate: startDate,
        startTime: startTime,
        endDate: endDate,
        endTime: endTime,
        allDay: startTime === null && endTime === null,
        // undated windows ("each day", "on both event days", or no mention at all) repeat on every event day
        everyDay: startDate === null
    };
}

/**
 * Parse the time windows stated in a line of text (e.g. "Minior encounters are more likely
 * from 5:00 p.m. to 9:00 p.m. local time each day."). Windows without a date apply to every
 * day of the event (everyDay).
 *
 * @param {string} text a single line/sentence of page text.
 * @return {Array} windows: { startDate, startTime, endDate, endTime, allDay, everyDay }; [] when the text has none
 */
function parse(text)
{
    return [...(text || "").matchAll(TIME_WINDOW)].map(m => timeWindow(null, m[1] || m[2], null, m[3]));
}

/**
 * Parse a sub-heading that is a date or date range rather than a label, e.g. "Saturday, November 14"
 * (all day) or "October 13 at 10:00 a.m. to October 16 at 10:00 a.m. local time".
 *
 * @param {string} text heading text.
 * @return {Array} windows (see parse); [] when the heading isn't a date
 */
function parseHeading(text)
{
    text = (text || "").trim().replace(/\s+local time\.?$/i, "");

    var range = text.match(DATE_RANGE_HEADING);
    if (range)
        return [timeWindow(range[1], range[2], range[3], range[4])];

    var day = text.match(DAY_HEADING);
    if (!day)
        return [];
    // anything after the date must be a time window, otherwise it's a label that starts with a date
    var times = parse(day[2]);
    if (day[2] && times.length == 0)
        return [];
    return times.length > 0 ? onDate(times, day[1]) : [timeWindow(day[1], null, day[1], null)];
}

/**
 * Pin undated windows to a single day, e.g. "10:00 a.m. to 1:00 p.m." listed under a
 * "Saturday, November 14" heading.
 */
function onDate(windows, date)
{
    return windows.map(w => w.startDate ? w : timeWindow(date, w.startTime, date, w.endTime));
}

module.exports = { parse, parseHeading, onDate }
