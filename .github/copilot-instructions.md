# ScrapedDuck - Copilot Context

## Purpose

Scrape Pokémon GO event data from LeekDuck.com, generate JSON/iCal outputs. Fork of [bigfoott/ScrapedDuck](https://github.com/bigfoott/ScrapedDuck).

## 3-Stage Pipeline

1. **scrape.js** → Basic data (events, raids, research, eggs, rocket)
   - `pages/events.js` scrapes event list → `files/events.min.json`
2. **detailedscrape.js** → Visit each event URL for details
   - Calls `pages/detailed/*.js` based on `eventType`
   - Always calls `generic.js` for all events
   - Saves temp files to `files/temp/`
3. **combinedetails.js** → Merge and generate finals
   - Merges temp files into `extraData` object
   - Outputs `files/events.json`, `files/events.min.json`
   - Generates `files/calendars/*.ics`

## Event Structure

```javascript
{
  eventID, name, eventType, heading, link, image, start, end,
  extraData: {
    generic: { hasSpawns, hasFieldResearchTasks },  // ALL events
    spotlight: {...},      // pokemon-spotlight-hour only
    communityday: {...},   // community-day only
    raidbattles: {...},    // raid-battles only
    breakthrough: {...},   // research-breakthrough only
    research: {...}        // research only
  }
}
```

## Event Types Handled

- `research-breakthrough`, `pokemon-spotlight-hour`, `community-day`, `raid-battles`, `research`
- All other types still get `generic` extraData

## Adding New Event Type Scraper

1. Create `pages/detailed/{type}.js` with `get(url, id, bkp)` function
2. Add to `detailedscrape.js`: require + if condition
3. Add to `combinedetails.js`: merge logic for `extraData.{type}`
4. Always include fallback to `bkp` data in catch block

## Key Patterns

- Use `JSDOM.fromURL()` for scraping
- Temp files: `{eventID}_generic.json` or `{eventID}.json`
- Always provide backup fallback in `.catch()` using backup from `data` branch
- Normalize CDN images: `cdn.leekduck.com/assets/`
- Match `eventID` from event URL: `.split("/events/")[1]`

## Tech Stack

- jsdom (DOM parsing), moment (dates), ical-generator (calendars)
- Runs via GitHub Actions every 10 min → pushes to `data` branch

## Local Execution

Full pipeline: `npm run scrape && npm run detailedscrape && npm run combinedetails`

## Commit Messages

- Use a conventional prefix such as `fix:`, `feat:`, `chore:`, `refactor:`, or `docs:`
- Keep the subject line under 50 characters and write it in the imperative mood
- Use bullet points in the body for high-level functional changes and why they matter
- When the change scope is small, prefer a single concise bullet in the body
- Avoid low-level implementation details in the commit body
