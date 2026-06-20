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
          spotlightSchedule: [],
          bonuses: [],
          raidbattles: { bosses: [], shinies: [] }
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
          var raidElements = collectSectionElementsThroughSubheadings(raidsH2);
          processRaidsSection(raidElements, 'raids', eventData, globalInfo);
        }

        var fiveStarH2 = pageContent.querySelector('h2#appearing-in-5-star-raids');
        if (fiveStarH2) {
          var fiveStarElements = collectSectionElementsThroughSubheadings(fiveStarH2);
          processRaidsSection(fiveStarElements, 'appearing-in-5-star-raids', eventData, globalInfo);
        }

        var saturdayHabitatH2 = pageContent.querySelector('h2#saturday-habitat-raids');
        if (saturdayHabitatH2) {
          var saturdayHabitatElements = collectSectionElements(saturdayHabitatH2);
          processHabitatRaidSection(saturdayHabitatElements, 'Saturday', eventData);
        }

        var sundayHabitatH2 = pageContent.querySelector('h2#sunday-habitat-raids');
        if (sundayHabitatH2) {
          var sundayHabitatElements = collectSectionElements(sundayHabitatH2);
          processHabitatRaidSection(sundayHabitatElements, 'Sunday', eventData);
        }

        var spotlightH2 = pageContent.querySelector('h2#spotlight-hours');
        if (spotlightH2) {
          var spotlightElements = collectSectionElements(spotlightH2);
          processSpotlightSection(spotlightElements, eventData);
        }

        var bonusesH2 = pageContent.querySelector('h2#bonuses');
        if (bonusesH2) {
          var bonusElements = collectSectionElements(bonusesH2);
          processBonusSection(bonusElements, eventData);
        }

        // Also try to find in-game bonuses section
        var inGameBonusesH2 = pageContent.querySelector('h2#in-game-bonuses-for-all-trainers');
        if (inGameBonusesH2) {
          var inGameBonusElements = collectSectionElements(inGameBonusesH2);
          processBonusSection(inGameBonusElements, eventData);
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
              if ('spotlightSchedule' in bkp[i].extraData) {
                fallbackData.spotlightSchedule = bkp[i].extraData.spotlightSchedule;
              }
              if ('bonuses' in bkp[i].extraData) {
                fallbackData.bonuses = bkp[i].extraData.bonuses;
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
  if (raidTypeLower.includes('super mega')) return 'Super Mega';
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

  // Try "Day RaidType" format
  // Example: "Saturday Super Mega Raids", "Sunday Five-Star Raids"
  var dayFirstRegex = new RegExp('^' + dayPattern + '\\s+(.+?raids?)$', 'i');
  var dayFirstMatch = headerText.match(dayFirstRegex);
  if (dayFirstMatch) {
    return {
      raidType: dayFirstMatch[2].trim(),
      date: dayFirstMatch[1].trim()
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

  var baseName = nameElement.innerHTML.trim();
  var finalName = baseName;
  
  // Prepend Shadow/Mega/Primal prefix if the raid type indicates it but the name doesn't already have it
  if (raidType) {
    var raidTypeLower = raidType.toLowerCase();
    
    // Add "Shadow" prefix for Shadow raids if not already present
    if (raidTypeLower.includes('shadow') && !baseName.toLowerCase().startsWith('shadow')) {
      finalName = 'Shadow ' + baseName;
    }
    // Add "Mega" prefix for Mega raids if not already present
    else if (raidTypeLower.includes('mega') && !baseName.toLowerCase().startsWith('mega')) {
      finalName = 'Mega ' + baseName;
    }
    // Add "Primal" prefix for Primal raids if not already present
    else if (raidTypeLower.includes('primal') && !baseName.toLowerCase().startsWith('primal')) {
      finalName = 'Primal ' + baseName;
    }
  }

  return {
    name: finalName,
    image: imageElement.src,
    canBeShiny: bossElement.querySelector(':scope > .shiny-icon') !== null,
    raidType: getTierFromRaidType(raidType)
  };
}

/**
 * Parse simple Pokemon data (used for Spotlight Hours sections in event pages)
 */
function parsePokemonFromElement(pokemonElement) {
  var nameElement = pokemonElement.querySelector(':scope > .pkmn-name');
  var imageElement = pokemonElement.querySelector(':scope > .pkmn-list-img > img');

  if (!nameElement || !imageElement) return null;

  return {
    name: nameElement.textContent.trim(),
    image: imageElement.src,
    canBeShiny: pokemonElement.querySelector(':scope > .shiny-icon') !== null
  };
}

/**
 * Parse boss data from simple list markup used by some event pages.
 * Expected structure: UL/OL with LI items containing image(s) + text label.
 */
function parseBossesFromSimpleList(listElement, raidType) {
  var listItems = listElement.querySelectorAll(':scope > li');

  return Array.from(listItems)
    .map(listItem => {
      var name = '';
      var nameElement = listItem.querySelector('.pkmn-name');

      if (nameElement) {
        name = nameElement.textContent.trim();
      } else {
        // Remove media before extracting text to avoid noisy labels.
        var textNode = listItem.cloneNode(true);
        textNode.querySelectorAll('img, svg').forEach(node => node.remove());
        name = textNode.textContent.replace(/\s+/g, ' ').trim();
      }

      if (!name) return null;

      var imageCandidates = Array.from(listItem.querySelectorAll('img'));
      var imageElement = imageCandidates.find(img => {
        var alt = (img.getAttribute('alt') || '').toLowerCase();
        var src = (img.getAttribute('src') || '').toLowerCase();
        return alt !== 'shiny' && !src.includes('shiny');
      });

      // Guard against context bullets (region notes, schedule notes, etc.)
      // that may appear in UL/OL elements but are not actual boss entries.
      if (!imageElement) return null;

      var imageSrc = imageElement.src || '';
      var looksLikePokemonImage = /pokemon_icons|poke_capture|pm\d+/i.test(imageSrc);
      if (!looksLikePokemonImage) return null;

      return {
        name: name,
        image: imageSrc,
        canBeShiny: listItem.querySelector('.shiny-icon, img[alt="shiny" i], img[title="shiny" i]') !== null,
        raidType: getTierFromRaidType(raidType)
      };
    })
    .filter(boss => boss !== null);
}

function inferRaidTypeFromText(text) {
  var textLower = (text || '').toLowerCase();

  if (textLower.includes('super mega raids')) return 'Super Mega Raids';
  if (textLower.includes('mega raids')) return 'Mega Raids';
  if (textLower.includes('primal raids')) return 'Primal Raids';
  if (textLower.includes('five-star raids') || textLower.includes('5-star raids')) return 'Five-Star Raids';
  if (textLower.includes('shadow raids')) return 'Shadow Raids';

  return null;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseSpotlightTimeFromText(text) {
  var timeMatch = text.match(/from\s+([\d:]+\s+[ap]\.?(?:m\.?)?\s+to\s+[\d:]+\s+[ap]\.?(?:m\.?)?)\s+local time/i);
  if (timeMatch) {
    return timeMatch[1] + ' local time';
  }

  return null;
}

function parseSpotlightNameAfterDate(strongNode) {
  var text = '';
  var node = strongNode.nextSibling;

  while (node) {
    if (node.nodeType === 1 && node.tagName === 'STRONG') {
      break;
    }

    if (node.nodeType === 3) {
      text += node.textContent;
    } else if (node.nodeType === 1 && node.tagName !== 'BR') {
      text += node.textContent;
    }

    node = node.nextSibling;
  }

  return text
    .replace(/[—–]/g, '-')
    .replace(/^[\s:-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Process event-specific Spotlight Hours schedules.
 */
function processSpotlightSection(elements, eventData) {
  var spotlightTime = null;
  var scheduleParagraph = null;
  var pokemonLookup = {};

  elements.forEach(element => {
    if (element.tagName === 'P') {
      var paragraphText = element.textContent.trim();

      if (!spotlightTime) {
        spotlightTime = parseSpotlightTimeFromText(paragraphText);
      }

      if (!scheduleParagraph && element.querySelector(':scope > strong')) {
        scheduleParagraph = element;
      }
    }

    if (element.className === 'pkmn-list-flex') {
      var pokemonItems = element.querySelectorAll(':scope > .pkmn-list-item');
      pokemonItems.forEach(item => {
        var pokemon = parsePokemonFromElement(item);
        if (pokemon) {
          pokemonLookup[normalizeName(pokemon.name)] = pokemon;
        }
      });
    }
  });

  if (!scheduleParagraph) {
    return;
  }

  var dateNodes = scheduleParagraph.querySelectorAll(':scope > strong');
  dateNodes.forEach(dateNode => {
    var date = dateNode.textContent.trim();
    var pokemonName = parseSpotlightNameAfterDate(dateNode);

    if (!date || !pokemonName) {
      return;
    }

    var details = pokemonLookup[normalizeName(pokemonName)] || {
      name: pokemonName,
      image: '',
      canBeShiny: false
    };

    eventData.spotlightSchedule.push({
      date: date,
      time: spotlightTime,
      pokemon: {
        name: details.name,
        image: details.image,
        canBeShiny: details.canBeShiny
      }
    });
  });
}

/**
 * Process event-specific bonus sections with time windows.
 * Groups bonuses by their start/end time windows.
 */
function processBonusSection(elements, eventData) {
  var currentBonusGroup = null;

  elements.forEach(element => {
    // Look for time window descriptions: "The following bonuses are active from X to Y"
    if (element.tagName === 'P') {
      var text = element.textContent.trim();
      var timeMatch = text.match(/from\s+([\d:]+\s+[ap]\.m\.)\s+to\s+([\d:]+\s+[ap]\.m\.)/i);
      
      if (timeMatch) {
        // Start a new bonus group with time window
        currentBonusGroup = {
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          description: text,
          items: []
        };
        eventData.bonuses.push(currentBonusGroup);
      }
    }

    // Process bonus-list divs that contain bonus items
    if (element.className === 'bonus-list' && currentBonusGroup) {
      var bonusItems = element.querySelectorAll(':scope > .bonus-item');
      
      bonusItems.forEach(bonusItem => {
        var bonusText = bonusItem.querySelector(':scope > .bonus-text');
        var bonusImage = bonusItem.querySelector(':scope > .item-circle > img');
        
        if (bonusText && bonusImage) {
          currentBonusGroup.items.push({
            text: bonusText.textContent.trim(),
            image: bonusImage.src
          });
        }
      });
    }
  });
}

/**
 * Match a boss name against a raid hour name, handling parenthetical qualifiers.
 * e.g. "Kyurem (Black)" should match "Black Kyurem" from raid hour text.
 */
function bossNamesMatch(bossName, raidHourName) {
  var bossLower = bossName.toLowerCase();
  var hourLower = raidHourName.toLowerCase();

  // Direct inclusion check (either string contains the other)
  // e.g. "Shadow Lugia" (raid hour) contains "Lugia" (boss name stored without prefix)
  if (bossLower.includes(hourLower) || hourLower.includes(bossLower)) {
    return true;
  }

  // Handle parenthetical qualifiers: "Kyurem (Black)" vs "Black Kyurem"
  // Extract base name and qualifier from boss name
  var parenMatch = bossLower.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    var baseName = parenMatch[1].trim();
    var qualifier = parenMatch[2].trim();
    // Match if raid hour name contains both the base name and the qualifier
    if (hourLower.includes(baseName) && hourLower.includes(qualifier)) {
      return true;
    }
  }

  return false;
}

function bossMatchesRaidHourType(boss, raidHourType) {
  if (!raidHourType || !boss.raidType) return false;

  var bossTypeLower = boss.raidType.toLowerCase();
  var raidHourTypeLower = raidHourType.toLowerCase();

  if (raidHourTypeLower === 'five-star' || raidHourTypeLower === '5-star') {
    return bossTypeLower.includes('tier 5') || bossTypeLower.includes('five');
  }
  if (raidHourTypeLower === 'mega') {
    return bossTypeLower.includes('mega') || bossTypeLower.includes('super mega');
  }
  if (raidHourTypeLower === 'primal') {
    return bossTypeLower.includes('primal');
  }
  if (raidHourTypeLower === 'shadow') {
    return bossTypeLower.includes('shadow');
  }

  return false;
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
 * Collect elements until next top-level section header.
 * Some event pages use additional H2 subheadings inside a section (e.g.,
 * Raids -> Featured Pokemon), so stopping at any H2 can skip valid data.
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

/**
 * Process a day-based raid section (e.g., "Monday, February 23: Kanto")
 * Creates one entry per date with all bosses and raid hour info
 */
function processDayRaidSection(elements, dayHeader, eventData, globalInfo) {
  // Extract base date from headers like "Friday, February 27: Unova (Black Kyurem)" → "Friday, February 27"
  var baseDate = dayHeader.split(':')[0].trim();
  
  var currentRaidType = null;
  var pendingRaidHours = [];
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
        var pendingRaidHour = {
          time: null,
          bossNames: [],
          bossType: null
        };

        // Extract time
        var timeMatch = text.match(/from ([\d:]+\s+[ap]\.?m\.?\s+to\s+[\d:]+\s+[ap]\.?m\.?)/i);
        if (timeMatch) {
          pendingRaidHour.time = timeMatch[1] + ' local time';
        }

        var allBossesMatch = text.match(/featuring\s+all\s+.+?\b(five-star|5-star|mega|primal|shadow)\s+raid bosses/i);
        if (allBossesMatch) {
          pendingRaidHour.bossType = allBossesMatch[1];
        }
        
        // Extract Pokemon names from "featuring X, Y, and Z" pattern
        var featuringMatch = text.match(/featuring\s+([^.]+?)(?:\s+from|\s*\.)/i);
        if (featuringMatch && !pendingRaidHour.bossType) {
          var pokemonText = featuringMatch[1];
          // Split by commas and "and" to get individual Pokemon names
          var pokemonNames = pokemonText
            .split(/,|\s+and\s+/)
            .map(name => name.trim())
            .filter(name => name.length > 0);
          
          pendingRaidHour.bossNames = pokemonNames;
        }

        if (pendingRaidHour.time && (pendingRaidHour.bossType || pendingRaidHour.bossNames.length > 0)) {
          pendingRaidHours.push(pendingRaidHour);
        }
      }
    }
  });
  
  pendingRaidHours.forEach(raidHour => {
    var raidHourBosses = [];

    if (raidHour.bossType) {
      raidHourBosses = dateEntry.bosses.filter(boss => bossMatchesRaidHourType(boss, raidHour.bossType));
    } else {
      raidHourBosses = dateEntry.bosses.filter(boss => {
        return raidHour.bossNames.some(raidHourName => {
          return bossNamesMatch(boss.name, raidHourName);
        });
      });
    }

    if (raidHourBosses.length > 0) {
      dateEntry.raidHours.push({
        time: raidHour.time,
        bosses: raidHourBosses
      });
    }
  });
}

/**
 * Process habitat raid sections that are grouped by day and time windows.
 * Example headers: "Stormfire Peaks (Saturday, 10:00 a.m. to 1:00 p.m.)"
 */
function processHabitatRaidSection(elements, dayName, eventData) {
  var currentRaidType = null;
  var currentTimeWindow = null;
  var currentHabitatLabel = null;

  elements.forEach(element => {
    // H3 defines each habitat slot and contains the time window in parentheses
    if (element.tagName === 'H3') {
      var h3Text = element.textContent.trim();
      var labelMatch = h3Text.match(/^(.+?)\s*\(/);
      currentHabitatLabel = labelMatch ? labelMatch[1].trim() : null;
      var timeMatch = h3Text.match(/\((?:[^,]+,\s*)?([\d:]+\s+[ap]\.m\.\s+to\s+[\d:]+\s+[ap]\.m\.)\)/i);
      currentTimeWindow = timeMatch ? timeMatch[1] : null;
      currentRaidType = null;
      return;
    }

    // H4 sets raid tier context for the next boss list (Mega Raids / Five-Star Raids)
    if (element.tagName === 'H4') {
      currentRaidType = element.textContent.trim();
      return;
    }

    // Parse habitat boss lists and attach them to both the day and specific time window
    if (element.className === 'pkmn-list-flex' && currentRaidType) {
      var bosses = parseBossesFromList(element, currentRaidType);

      if (currentTimeWindow && bosses.length > 0) {
        // Habitat raids belong to schedule slots, not one-hour raidHours.
        // Keep one raidSchedule entry per day + time window.
        var timeSlotEntry = eventData.raidSchedule.find(entry =>
          entry.date === dayName && entry.time === currentTimeWindow
        );
        if (!timeSlotEntry) {
          timeSlotEntry = {
            date: dayName,
            time: currentTimeWindow,
            label: currentHabitatLabel,
            bosses: [],
            raidHours: [],
            bonuses: []
          };
          eventData.raidSchedule.push(timeSlotEntry);
        } else if (!timeSlotEntry.label && currentHabitatLabel) {
          // Keep label optional, but populate it when available.
          timeSlotEntry.label = currentHabitatLabel;
        }

        bosses.forEach(boss => {
          if (!timeSlotEntry.bosses.some(existing => existing.name === boss.name)) {
            timeSlotEntry.bosses.push(boss);
          }

          if (!eventData.raidbattles.bosses.some(existing => existing.name === boss.name)) {
            eventData.raidbattles.bosses.push(boss);
          }
        });
      }
    }
  });
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

          // Also keep an aggregate list for consumers that read raidbattles.
          if (!eventData.raidbattles.bosses.some(existing => existing.name === boss.name)) {
            eventData.raidbattles.bosses.push(boss);
          }
        });
      } else {
        // This is a static raid list
        var bosses = parseBossesFromList(element, contextRaidType);
        bosses.forEach(bossData => {
          if (!eventData.raidbattles.bosses.some(existing => existing.name === bossData.name)) {
            eventData.raidbattles.bosses.push(bossData);
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

    // Learn raid type context from paragraph text for list-based layouts.
    if (element.tagName === 'P' && !currentRaidType) {
      var inferredRaidType = inferRaidTypeFromText(element.textContent);
      if (inferredRaidType) {
        contextRaidType = inferredRaidType;
      }
    }

    // Handle simple list-based raid layouts (UL/OL) used by some Raid Day pages.
    if ((element.tagName === 'UL' || element.tagName === 'OL') && element.className !== 'bonus-list') {
      var listBosses = parseBossesFromSimpleList(element, currentRaidType || contextRaidType);
      if (listBosses.length > 0) {
        if (currentDate && currentDateEntry) {
          listBosses.forEach(boss => {
            if (!currentDateEntry.bosses.some(existing => existing.name === boss.name)) {
              currentDateEntry.bosses.push(boss);
            }
            if (!eventData.raidbattles.bosses.some(existing => existing.name === boss.name)) {
              eventData.raidbattles.bosses.push(boss);
            }
          });
        } else {
          listBosses.forEach(boss => {
            if (!eventData.raidbattles.bosses.some(existing => existing.name === boss.name)) {
              eventData.raidbattles.bosses.push(boss);
            }
          });
        }
      }
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
            // Map keywords to tier patterns
            // "five-star" or "5-star" should match "Tier 5"
            if (keyword === 'five-star') {
              return bossTypeLower.includes('tier 5') || bossTypeLower.includes('five');
            }
            if (keyword === 'shadow') {
              return bossTypeLower.includes('shadow');
            }
            if (keyword === 'mega') {
              return bossTypeLower.includes('mega');
            }
            if (keyword === 'primal') {
              return bossTypeLower.includes('primal');
            }
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
