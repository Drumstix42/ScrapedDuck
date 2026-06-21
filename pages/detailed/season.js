const fs = require('fs');
const jsd = require('jsdom');
const { JSDOM } = jsd;

const DAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

/**
 * Collect seasonal Daily Discovery bonuses and season-long bonuses from a
 * leekduck season event page.
 *
 * @param {string} url leekduck.com url for the season event page.
 * @param {string} id unique event id string.
 * @param {dict} bkp parsed events.min.json. Used for fallback data, if anything goes wrong.
 * @returns {Promise}
 */
function get(url, id, bkp) {
  return new Promise(resolve => {
    JSDOM.fromURL(url, {})
      .then(dom => {
        var pageContent = dom.window.document.querySelector('.page-content') || dom.window.document;

        var seasonData = {
          note: null,
          dailyBonuses: [],
          seasonBonuses: []
        };

        parseDailyDiscoveries(pageContent, seasonData);
        parseSeasonBonuses(pageContent, seasonData);

        writeTemp(id, seasonData, resolve);
      })
      .catch(_err => {
        console.log(`Error scraping season ${id}: ${_err}`);
        // On error, fall back to season data from the backup events feed.
        var fallback = findBackupSeason(bkp, id);
        if (fallback) {
          writeTemp(id, fallback, resolve);
        } else {
          resolve();
        }
      });
  });
}

function writeTemp(id, data, resolve) {
  fs.writeFile(`files/temp/${id}_season.json`, JSON.stringify({ id: id, type: 'season', data: data }), err => {
    if (err) {
      console.error(err);
    }
    resolve();
  });
}

function findBackupSeason(bkp, id) {
  for (var i = 0; i < bkp.length; i++) {
    if (bkp[i].eventID == id && bkp[i].extraData != null && bkp[i].extraData.season) {
      return bkp[i].extraData.season;
    }
  }
  return null;
}

/**
 * Parse the "Daily Discoveries" section. Each day is a .day-card that may
 * contain one or more titled bonus groups (e.g. a Monday card carrying both
 * "Fast-Track Monday" and "Max Monday"), an optional footnote, and a list of
 * bonus bullet points per title.
 */
function parseDailyDiscoveries(pageContent, seasonData) {
  var heading = pageContent.querySelector('h2#daily-discoveries');
  if (heading) {
    // Capture the intro paragraph(s) between the heading and the day cards.
    var noteParts = [];
    var current = heading.nextElementSibling;
    while (current && !(current.classList && current.classList.contains('daily-discoveries'))) {
      if (current.tagName === 'P') {
        var paragraph = current.textContent.replace(/\s+/g, ' ').trim();
        if (paragraph) {
          noteParts.push(paragraph);
        }
      }
      current = current.nextElementSibling;
    }
    if (noteParts.length > 0) {
      seasonData.note = noteParts.join(' ');
    }
  }

  var container = pageContent.querySelector('.daily-discoveries');
  if (!container) {
    return;
  }

  var cards = container.querySelectorAll(':scope > .day-card');
  cards.forEach(card => {
    var dayName = null;
    var footnote = null;
    var bonuses = [];
    var currentGroup = null;

    Array.from(card.children).forEach(child => {
      var classes = child.classList;

      if (classes && classes.contains('day-label')) {
        dayName = toTitleCase(child.textContent.trim());
      } else if (classes && classes.contains('day-title')) {
        // Drop the trailing asterisk(s) used purely to link a title to its footnote.
        var title = child.textContent.trim().replace(/\s*\*+$/, '').trim();
        currentGroup = { title: title, items: [] };
        bonuses.push(currentGroup);
      } else if (child.tagName === 'UL' || child.tagName === 'OL') {
        var items = Array.from(child.querySelectorAll(':scope > li'))
          .map(li => li.textContent.replace(/\s+/g, ' ').trim())
          .filter(text => text.length > 0);

        if (!currentGroup) {
          // A list without a preceding title — keep it as an untitled group.
          currentGroup = { title: null, items: [] };
          bonuses.push(currentGroup);
        }
        currentGroup.items.push(...items);
      } else if (classes && classes.contains('footnote')) {
        // Drop the leading asterisk(s) that mirror the marker on the linked title.
        var note = child.textContent.replace(/\s+/g, ' ').trim().replace(/^\*+\s*/, '');
        if (note) {
          footnote = footnote ? footnote + ' ' + note : note;
        }
      }
    });

    // Drop titled groups that ended up with no bullet points...
    bonuses = bonuses.filter(group => group.items.length > 0);

    // ...and omit days that have no bonuses at all (e.g. Saturday).
    if (bonuses.length === 0) {
      return;
    }

    var dayIndex = dayName ? DAY_INDEX[dayName.toLowerCase()] : undefined;

    seasonData.dailyBonuses.push({
      day: dayName,
      dayOfWeek: dayIndex === undefined ? null : dayIndex,
      bonuses: bonuses,
      footnote: footnote
    });
  });
}

/**
 * Parse the season-long bonuses under the top-level "Bonuses" section.
 * Layouts vary between seasons: some group bonuses by GO Pass rank (H3
 * milestone headings, one bonus-list each), others present a single flat
 * bonus-list with no milestones. Both share the same .bonus-item markup.
 */
function parseSeasonBonuses(pageContent, seasonData) {
  var bonusesH2 = pageContent.querySelector('h2#bonuses');
  if (!bonusesH2) {
    return;
  }

  var elements = collectSectionElementsThroughSubheadings(bonusesH2);
  var currentMilestone = null;

  elements.forEach(element => {
    // H3 headings denote a milestone (e.g. "Rank 1"); sub-H2 section labels
    // (e.g. "Seasonal Bonuses") are not milestones and are left untracked.
    if (element.tagName === 'H3') {
      currentMilestone = element.textContent.replace(/\s+/g, ' ').trim() || null;
      return;
    }

    if (element.classList && element.classList.contains('bonus-list')) {
      extractBonusItems(element, currentMilestone, seasonData);
    } else if (element.querySelectorAll) {
      // Safety net: handle bonus-lists nested inside a wrapper element.
      element.querySelectorAll('.bonus-list').forEach(list => {
        extractBonusItems(list, currentMilestone, seasonData);
      });
    }
  });
}

function extractBonusItems(listElement, milestone, seasonData) {
  var items = listElement.querySelectorAll(':scope > .bonus-item');
  items.forEach(item => {
    var textEl = item.querySelector(':scope > .bonus-text');
    var imgEl = item.querySelector('.item-circle img') || item.querySelector('img');

    var text = textEl
      ? textEl.textContent.replace(/\s+/g, ' ').trim()
      : (imgEl ? (imgEl.getAttribute('alt') || '').replace(/\s+/g, ' ').trim() : '');

    if (!text) {
      return;
    }

    seasonData.seasonBonuses.push({
      milestone: milestone,
      text: text,
      image: imgEl ? imgEl.src : null
    });
  });
}

/**
 * Collect elements after an H2 until the next top-level section header,
 * stepping through nested sub-headings (sub-H2s and H3s) along the way.
 */
function collectSectionElementsThroughSubheadings(startH2) {
  var elements = [];
  var current = startH2.nextElementSibling;

  while (current) {
    if (current.tagName === 'H2') {
      var classes = current.className || '';
      var isTopLevelSection = current.id && classes.includes('event-section-header');
      if (isTopLevelSection) {
        break;
      }
    }
    elements.push(current);
    current = current.nextElementSibling;
  }

  return elements;
}

function toTitleCase(text) {
  var lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

module.exports = { get };
