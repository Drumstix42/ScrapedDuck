# ScrapedDuck - Copilot Context

> Companion to [../AGENTS.md](../AGENTS.md) (used by Claude Code and other agents). Keep the two in sync.

## Keep these docs current

While working, if you notice anything in this file or [../AGENTS.md](../AGENTS.md) that is outdated,
inaccurate, or incomplete (renamed/removed file, changed pipeline step, new event type, different CI
schedule, stale command, etc.), proactively flag it and suggest the fix. When a code change alters
behavior these docs describe, propose the matching doc update in the same change, and update **both**
files so they stay in sync.

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
   - Outputs the merged JSON files to `files/`
   - Generates `files/calendars/*.ics`

## Event Structure

```javascript
{
  eventID, name, eventType, eventTypes, heading, link, image, start, end,
  extraData: {
    generic: { hasSpawns, hasFieldResearchTasks },  // ALL events
    spotlight: {...},      // pokemon-spotlight-hour
    communityday: {...},   // community-day
    raidbattles: {...},    // raid-battles (and event-style pages with raids)
    breakthrough: {...},   // research-breakthrough
    promocodes: [...],     // research (only when the page has codes)
    season: {...},         // season
    raidSchedule, spotlightSchedule, bonuses  // event-style pages, flattened in
  }
}
```

## Event Types Handled

- `eventType` is the primary type, as shown on the events list. It drives detail-scraper dispatch
  and per-type calendars.
- `eventTypes` is every type tagged on the event page (e.g. `["event", "location-specific"]`), scraped
  by `pages/detailed/generic.js`. It always starts with `eventType` and has no duplicates.
- Dedicated detail scrapers: `research-breakthrough`, `pokemon-spotlight-hour`, `community-day`,
  `raid-battles`, `research`, `season`. `event`, `raid-day`, `raid-hour` and `pokemon-go-fest` use
  the event-style scraper `pages/detailed/event.js`. All other types still receive `generic` extraData.

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
- Run every event type slug through `pages/eventtype.js` (`é`→`e`, and maps slugs LeekDuck has
  renamed, e.g. `ticketed`→`ticketed-event`). Add new aliases there.
- Match `eventID` from event URL: `.split("/events/")[1]`

## Tech Stack

- Node version pinned in `.nvmrc` (current LTS); CI reads it via `node-version-file`. jsdom 30 needs Node `^22.22.2 || ^24.15.0 || >=26`
- jsdom (DOM parsing), moment (dates), ical-generator (calendars)
- Runs via GitHub Actions (daily cron `0 3 * * *` + on push to `master` + manual dispatch) → force-pushes to orphan `data` branch

## Local Execution

Switch to the `.nvmrc` Node version (`nvm use` / `fnm use`), `npm install`, then run the full pipeline (in order): `npm run scrape:all` (runs scrape → detailedscrape → combinedetails)

## Commit Messages

- Use a conventional prefix such as `fix:`, `feat:`, `chore:`, `refactor:`, or `docs:`
- Keep the subject line under 50 characters and write it in the imperative mood
- Use bullet points in the body for high-level functional changes and why they matter
- When the change scope is small, prefer a single concise bullet in the body
- Avoid low-level implementation details in the commit body
- Do not add a `Co-Authored-By` trailer or any AI attribution footer to commit messages
