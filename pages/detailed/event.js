const fs = require('fs');
const jsd = require('jsdom');
const { JSDOM } = jsd;

/**
 * Collect event raid battles and/or raid schedule data from leekduck event page.
 *
 * @param {string} url leekduck.com url for event specific website.
 * @param {string} id unique event id string.
 * @param {dict} bkp parsed event_min.json. Used for fallback data, if anything goes wrong.
 * @returns {Promise}
 */
function get(url, id, bkp) {
  return new Promise(resolve => {
    JSDOM.fromURL(url, {})
      .then(dom => {
        var eventData = {
          raidSchedule: [],
          raidbattles: []
        };

        var pageContent = dom.window.document.querySelector('.page-content');

        // Global raid hour and bonus info to distribute to applicable days
        var globalInfo = {
          raidHourTime: null,
          raidHourSectionId: null, // Track which section had raid hour text
          raidTypesWithRaidHour: [],
          specialNotes: []
        };

        // Process raid sections using DOM structure
        var raidsH2 = pageContent.querySelector('h2#raids');
        if (raidsH2) {
          var raidElements = collectSectionElements(raidsH2);
          processRaidsSection(raidElements, 'raids', eventData, globalInfo);
        }

        var fiveStarH2 = pageContent.querySelector('h2#appearing-in-5-star-raids');
        if (fiveStarH2) {
          var fiveStarElements = collectSectionElements(fiveStarH2);
          processRaidsSection(fiveStarElements, 'appearing-in-5-star-raids', eventData, globalInfo);
        }

        // Also check for day-based raid sections (e.g., "Monday, February 23: Kanto")
        // These events organize raids by day rather than in a single "raids" section
        var allH2 = pageContent.querySelectorAll('h2');
        allH2.forEach(h2 => {
          // Look for H2 headers that match day patterns
          var h2Text = h2.textContent.trim();
          var dayPattern = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d+/i;
          if (dayPattern.test(h2Text)) {
            var dayElements = collectSectionElements(h2);
            processDayRaidSection(dayElements, h2Text, eventData, globalInfo);
          }
        });

        // Distribute raid hour info to scheduled days if found in appearing-in-5-star-raids section
        if (globalInfo.raidHourTime && globalInfo.raidHourSectionId === 'appearing-in-5-star-raids') {
          eventData.raidSchedule.forEach(day => {
            if (day.raidHours.length === 0) {
              // Apply to all 5-star bosses
              var fiveStarBosses = day.bosses.filter(boss => {
                var typeLower = boss.raidType ? boss.raidType.toLowerCase() : '';
                return typeLower.includes('tier 5') || typeLower.includes('five');
              });
              
              if (fiveStarBosses.length > 0) {
                day.raidHours.push({
                  time: globalInfo.raidHourTime,
                  bosses: fiveStarBosses
                });
              }
            }
          });
        }

        // Distribute special bonuses to relevant raid days. Attach a bonus to a
        // day if the note explicitly references a matching boss appearing that day
        globalInfo.specialNotes.forEach(note => {
          var noteLower = note.toLowerCase();
          eventData.raidSchedule.forEach(day => {
            // Check if any boss name from this day appears in the bonus text
            var relevantBonus = day.bosses.some(boss => {
              var bossNameVariants = [
                boss.name.toLowerCase(),
                boss.name.replace(/\s*\(.*\)/, '').toLowerCase()
              ];
              return bossNameVariants.some(variant => noteLower.includes(variant));
            });

            if (relevantBonus) {
              day.bonuses.push(note);
            }
          });
        });

        fs.writeFile(`files/temp/${id}.json`, JSON.stringify({ id: id, type: 'event', data: eventData }), err => {
          if (err) {
            console.error(err);
          }
          resolve();
        });
      })
      .catch(_err => {
        console.log(`Error scraping event ${id}: ${_err}`);
        // On error, check backup data for fallback
        for (var i = 0; i < bkp.length; i++) {
          if (bkp[i].eventID == id && bkp[i].extraData != null) {
            // Check for existing event data in backup data -> use these data instead for temporary json file
            var fallbackData = {};

            // Handle both old nested structure and new flattened structure
            if ('event' in bkp[i].extraData) {
              fallbackData = bkp[i].extraData.event;
            } else {
              // Extract flattened structure
              if ('raidSchedule' in bkp[i].extraData) {
                fallbackData.raidSchedule = bkp[i].extraData.raidSchedule;
              }
              if ('raidbattles' in bkp[i].extraData) {
                fallbackData.raidbattles = bkp[i].extraData.raidbattles;
              }
            }

            if (Object.keys(fallbackData).length > 0) {
              fs.writeFile(
                `files/temp/${id}.json`,
                JSON.stringify({
                  id: id,
                  type: 'event',
                  data: fallbackData
                }),
                err => {
                  if (err) {
                    console.error(err);
                  }
                  resolve();
                }
              );
            }
          }
        }
        resolve();
      });
  });
}

/**
 * Determine tier from raid label data
 */
function getTierFromRaidType(raidType) {
  if (!raidType) return null;

  var raidTypeLower = raidType.toLowerCase();

  // Extract tier regardless of shadow/regular
  if (raidTypeLower.includes('one-star') || raidTypeLower.includes('1-star')) return 'Tier 1';
  if (raidTypeLower.includes('three-star') || raidTypeLower.includes('3-star')) return 'Tier 3';
  if (raidTypeLower.includes('five-star') || raidTypeLower.includes('5-star')) return 'Tier 5';
  if (raidTypeLower.includes('six-star') || raidTypeLower.includes('6-star')) return 'Tier 6';
  if (raidTypeLower.includes('mega')) return 'Mega';
  if (raidTypeLower.includes('primal')) return 'Primal';
  if (raidTypeLower.includes('shadow') && !raidTypeLower.includes('star')) return 'Shadow';

  return null; // Unknown tier
}

/**
 * Parse raid type and date from header text
 */
function parseRaidHeader(headerText, contextRaidType) {
  // Day name pattern for strict date matching
  var dayPattern = '(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
  var datePattern = dayPattern + ',\\s+\\w+\\s+\\d+'; // e.g., "Monday, November 10"
  
  // Try to parse "Type: Date" format first
  // Examples: "Five-Star Raids: Tuesday, November 11" or "Five-Star Shadow Raids: Monday, November 10"
  var typeAndDateMatch = headerText.match(/([^:]+):\s*(.+)/);
  if (typeAndDateMatch) {
    var dateRegex = new RegExp(datePattern, 'i');
    if (dateRegex.test(typeAndDateMatch[2])) {
      return {
        raidType: typeAndDateMatch[1].trim(),
        date: typeAndDateMatch[2].trim()
      };
    }
  }
  
  // Try date-only format when we have context from section headers
  // Examples: "Tuesday, November 19" when contextRaidType is "Five-Star Raids"
  // Must start with a day name to avoid matching "Appearing in X-Star Raids"
  var dateOnlyRegex = new RegExp('^' + datePattern, 'i');
  var dateOnlyMatch = headerText.match(dateOnlyRegex);
  if (dateOnlyMatch && contextRaidType) {
    return {
      raidType: contextRaidType,
      date: dateOnlyMatch[0].trim()
    };
  }
  
  // Try "Appearing in X-Star Raids (DayName)" format
  // Examples: "Appearing in 5-Star Raids (Saturday)", "Appearing in 3-Star Raids (Sunday)"
  var dayInParensRegex = new RegExp('appearing in\\s+([\\w-]+[\\s-]*star[\\s-]*(?:shadow\\s+)?raids?)\\s*\\((' + dayPattern + ')\\)', 'i');
  var dayInParensMatch = headerText.match(dayInParensRegex);
  if (dayInParensMatch) {
    return {
      raidType: dayInParensMatch[1].trim(),
      date: dayInParensMatch[2].trim() // Just the day name, no full date
    };
  }
  
  return null; // Could not parse
}

/**
 * Parse all bosses from a pokemon list element
 */
function parseBossesFromList(pokemonList, raidType) {
  var bosses = pokemonList.querySelectorAll(':scope > .pkmn-list-item');
  
  return Array.from(bosses)
    .map(boss => parseBossFromElement(boss, raidType))
    .filter(parsed => parsed !== null);
}

/**
 * Parse boss data from DOM element
 */
function parseBossFromElement(bossElement, raidType) {
  var nameElement = bossElement.querySelector(':scope > .pkmn-name');
  var imageElement = bossElement.querySelector(':scope > .pkmn-list-img > img');

  if (!nameElement || !imageElement) return null;

  return {
    name: nameElement.innerHTML.trim(),
    image: imageElement.src,
    canBeShiny: bossElement.querySelector(':scope > .shiny-icon') !== null,
    raidType: getTierFromRaidType(raidType)
  };
}

/**
 * Collect all elements between an H2 and the next H2
 */
function collectSectionElements(startH2) {
  var elements = [];
  var current = startH2.nextElementSibling;
  
  while (current && current.tagName !== 'H2') {
    elements.push(current);
    current = current.nextElementSibling;
  }
  
  return elements;
}

/**
 * Process a day-based raid section (e.g., "Monday, February 23: Kanto")
 * Creates one entry per date with all bosses and raid hour info
 */
function processDayRaidSection(elements, dayHeader, eventData, globalInfo) {
  // Extract base date from headers like "Friday, February 27: Unova (Black Kyurem)" → "Friday, February 27"
  var baseDate = dayHeader.split(':')[0].trim();
  
  var currentRaidType = null;
  var allBosses = []; // Track all bosses for this section
  var raidHourTime = null;
  var raidHourBossNames = []; // Boss names mentioned in Raid Hour text
  var inRaidHourSection = false;
  
  // Find or create entry for this date
  var dateEntry = eventData.raidSchedule.find(entry => entry.date === baseDate);
  if (!dateEntry) {
    dateEntry = {
      date: baseDate,
      bosses: [],
      raidHours: [],
      bonuses: []
    };
    eventData.raidSchedule.push(dateEntry);
  }
  
  elements.forEach(element => {
    // Handle H3 headers for raid types
    if (element.tagName === 'H3' && element.textContent) {
      var h3Text = element.textContent.trim();
      var h3Lower = h3Text.toLowerCase();
      
      // Check if it's a raid hours section
      if (h3Lower.includes('raid hour')) {
        inRaidHourSection = true;
        currentRaidType = null;
      }
      // Check for raid type headers
      else if (h3Lower.includes('star') && h3Lower.includes('raids')) {
        currentRaidType = h3Text;
        inRaidHourSection = false;
      }
      else if (h3Lower.includes('primal') && h3Lower.includes('raids')) {
        currentRaidType = 'Primal Raids';
        inRaidHourSection = false;
      }
      else if (h3Lower.includes('mega') && h3Lower.includes('raids')) {
        currentRaidType = 'Mega Raids';
        inRaidHourSection = false;
      }
      else if (h3Lower.includes('shadow') && h3Lower.includes('raids')) {
        currentRaidType = 'Shadow Raids';
        inRaidHourSection = false;
      }
    }
    
    // Handle Pokemon lists for scheduled raids
    if (element.className === 'pkmn-list-flex' && currentRaidType && !inRaidHourSection) {
      var bosses = parseBossesFromList(element, currentRaidType);
      bosses.forEach(boss => {
        // Add boss if not already in the date entry (avoid duplicates)
        if (!dateEntry.bosses.some(existing => existing.name === boss.name)) {
          dateEntry.bosses.push(boss);
        }
      });
    }
    
    // Handle raid hour details - extract time and featured Pokemon from text
    if (element.tagName === 'P' && inRaidHourSection) {
      var text = element.textContent.trim();
      var textLower = text.toLowerCase();
      
      if (textLower.includes('raid hour')) {
        // Extract time
        var timeMatch = text.match(/from ([\d:]+\s+[ap]\.?m\.?\s+to\s+[\d:]+\s+[ap]\.?m\.?)/i);
        if (timeMatch) {
          raidHourTime = timeMatch[1] + ' local time';
        }
        
        // Extract Pokemon names from "featuring X, Y, and Z" pattern
        var featuringMatch = text.match(/featuring\s+([^.]+?)(?:\s+from|\s*\.)/i);
        if (featuringMatch) {
          var pokemonText = featuringMatch[1];
          // Split by commas and "and" to get individual Pokemon names
          var pokemonNames = pokemonText
            .split(/,|\s+and\s+/)
            .map(name => name.trim())
            .filter(name => name.length > 0);
          
          raidHourBossNames = pokemonNames;
        }
      }
    }
  });
  
  // Create raid hour entry if we have the data
  if (raidHourTime && raidHourBossNames.length > 0) {
    // Find matching bosses from the date's boss list
    var raidHourBosses = dateEntry.bosses.filter(boss => {
      return raidHourBossNames.some(raidHourName => {
        return boss.name.toLowerCase().includes(raidHourName.toLowerCase());
      });
    });
    
    if (raidHourBosses.length > 0) {
      dateEntry.raidHours.push({
        time: raidHourTime,
        bosses: raidHourBosses
      });
    }
  }
}

/**
 * Process a raids section (either "raids" or "appearing-in-5-star-raids")
 */
function processRaidsSection(elements, sectionId, eventData, globalInfo) {
  var contextRaidType = sectionId === 'appearing-in-5-star-raids' ? 'Five-Star Raids' : null;
  var currentDate = null;
  var currentRaidType = null;
  var currentDateEntry = null;
  
  elements.forEach(element => {
    // Handle H3 headers
    if (element.tagName === 'H3' && element.textContent) {
      var h3Text = element.textContent.trim();
      
      // Try to parse as a date header first
      var parsedHeader = parseRaidHeader(h3Text, contextRaidType);
      if (parsedHeader) {
        // This is a daily schedule header
        currentDate = parsedHeader.date;
        currentRaidType = parsedHeader.raidType;
        
        // Find or create entry for this date
        currentDateEntry = eventData.raidSchedule.find(entry => entry.date === currentDate);
        if (!currentDateEntry) {
          currentDateEntry = {
            date: currentDate,
            bosses: [],
            raidHours: [],
            bonuses: []
          };
          eventData.raidSchedule.push(currentDateEntry);
        }
      } else {
        // Not a date header, might be a raid type header like "Appearing in 3-Star Raids" or "Three-Star Raids"
        currentDate = null;
        currentRaidType = null;
        currentDateEntry = null;
        
        // Update context if it's a raid type header
        var h3Lower = h3Text.toLowerCase();
        
        // Check for "Appearing in X-Star Raids" format
        if (h3Lower.includes('appearing in') && h3Lower.includes('raids')) {
          var typeMatch = h3Text.match(/appearing in\s+([\w-]+)[\s-]*raids?/i);
          if (typeMatch) {
            var base = typeMatch[1]
              .toLowerCase()
              .replace(/-star$/i, '')
              .replace(/\s+star$/i, '')
              .trim();
            contextRaidType = base.charAt(0).toUpperCase() + base.slice(1) + '-Star Raids';
          }
        }
        // Check for direct "X-Star Raids" format (e.g., "One-Star Raids", "Three-Star Raids")
        else if (h3Lower.includes('star') && h3Lower.includes('raids')) {
          // Match patterns like "One-Star Raids", "3-Star Raids", "Five-Star Shadow Raids"
          var directMatch = h3Text.match(/([\w-]+[\s-]*star[\s-]*(?:shadow\s+)?raids?)/i);
          if (directMatch) {
            contextRaidType = directMatch[1].trim();
          }
        }
        // Check for Primal Raids
        else if (h3Lower.includes('primal') && h3Lower.includes('raids')) {
          contextRaidType = 'Primal Raids';
        }
        // Check for Mega Raids
        else if (h3Lower.includes('mega') && h3Lower.includes('raids')) {
          contextRaidType = 'Mega Raids';
        }
        // Check for Shadow Raids (standalone, not "Five-Star Shadow Raids")
        else if (h3Lower.includes('shadow') && h3Lower.includes('raids') && !h3Lower.includes('star')) {
          contextRaidType = 'Shadow Raids';
        }
      }
    }
    
    // Handle Pokemon lists
    if (element.className === 'pkmn-list-flex') {
      if (currentDate && currentDateEntry) {
        // This list is part of a daily schedule
        var bossData = parseBossesFromList(element, currentRaidType);
        bossData.forEach(boss => {
          // Add boss if not already in the date entry (avoid duplicates)
          if (!currentDateEntry.bosses.some(existing => existing.name === boss.name)) {
            currentDateEntry.bosses.push(boss);
          }
        });
      } else {
        // This is a static raid list
        var bosses = parseBossesFromList(element, contextRaidType);
        bosses.forEach(bossData => {
          if (!eventData.raidbattles.some(existing => existing.name === bossData.name)) {
            eventData.raidbattles.push(bossData);
          }
        });
      }
    }
    
    // Handle raid hour information
    if (element.tagName === 'P' && element.textContent.includes('Raid Hour')) {
      var raidHourText = element.textContent.trim();
      var raidHourLower = raidHourText.toLowerCase();
      
      // Track which section this raid hour belongs to
      globalInfo.raidHourSectionId = sectionId;
      
      // Extract time
      var timeMatch = raidHourText.match(/from ([\d:]+\s+[ap]\.m\.\s+to\s+[\d:]+\s+[ap]\.m\.)/i);
      if (timeMatch) {
        globalInfo.raidHourTime = timeMatch[1] + ' local time';
      }
      
      // Extract raid type keywords mentioned in the raid hour text
      // Look for common raid type indicators
      if (raidHourLower.includes('five-star') || raidHourLower.includes('5-star')) {
        if (!globalInfo.raidTypesWithRaidHour.includes('five-star')) {
          globalInfo.raidTypesWithRaidHour.push('five-star');
        }
      }
      if (raidHourLower.includes('shadow')) {
        if (!globalInfo.raidTypesWithRaidHour.includes('shadow')) {
          globalInfo.raidTypesWithRaidHour.push('shadow');
        }
      }
      if (raidHourLower.includes('mega')) {
        if (!globalInfo.raidTypesWithRaidHour.includes('mega')) {
          globalInfo.raidTypesWithRaidHour.push('mega');
        }
      }
      if (raidHourLower.includes('primal')) {
        if (!globalInfo.raidTypesWithRaidHour.includes('primal')) {
          globalInfo.raidTypesWithRaidHour.push('primal');
        }
      }
      // Add more raid types as needed
    }
    
    // Handle special bonus notes
    if (element.tagName === 'P') {
      var noteTextLower = element.textContent.toLowerCase();
      if (
        noteTextLower.includes('fusion energy') ||
        noteTextLower.includes('mega energy') ||
        noteTextLower.includes('primal energy') ||
        noteTextLower.includes('adventure effect move')
      ) {
        var noteText = element.textContent.trim();
        if (noteText.length > 10) {
          globalInfo.specialNotes.push(noteText);
        }
      }
    }
  });
  
  // Create raid hour entries for scheduled days
  if (globalInfo.raidHourTime) {
    eventData.raidSchedule.forEach(entry => {
      if (entry.raidHours.length === 0) {
        // Find bosses that match raid hour criteria
        var raidHourBosses = entry.bosses.filter(boss => {
          var bossTypeLower = boss.raidType ? boss.raidType.toLowerCase() : '';
          return globalInfo.raidTypesWithRaidHour.some(keyword => {
            return bossTypeLower.includes(keyword);
          });
        });
        
        if (raidHourBosses.length > 0) {
          entry.raidHours.push({
            time: globalInfo.raidHourTime,
            bosses: raidHourBosses
          });
        }
      }
    });
  }
}

module.exports = { get };
