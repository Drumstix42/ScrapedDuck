# AGENTS.md

Guidance for AI coding agents (Claude Code, etc.) working in this repo. See also
[.github/copilot-instructions.md](.github/copilot-instructions.md), which mostly mirrors this file
(it's auto-consumed by GitHub Copilot). Keep the two in sync when you change project conventions.

## Keep these docs current

While working, if you notice anything in this file or
[.github/copilot-instructions.md](.github/copilot-instructions.md) that is outdated, inaccurate, or
incomplete — a renamed/removed file, a changed pipeline step, a new event type, a different CI
schedule, a stale command, etc. — proactively flag it and suggest the fix. When a code change alters
behavior these docs describe, propose the matching doc update in the same change, and update **both**
files so they stay in sync.

## What this is

ScrapedDuck scrapes Pokémon GO data from [LeekDuck.com](https://leekduck.com) (with permission) and
emits JSON + iCal files. A GitHub Actions job runs the pipeline and force-pushes the generated output
to the orphan `data` branch, which external apps consume. Fork of
[bigfoott/ScrapedDuck](https://github.com/bigfoott/ScrapedDuck).

## Tech stack

- Plain Node.js (no build step, no framework, no TypeScript).
- `jsdom` for DOM parsing (`JSDOM.fromURL()`), `moment` for dates, `ical-generator` for calendars.
- No test suite and no linter are configured — verify changes by running the pipeline locally.

## 3-stage pipeline

1. **[scrape.js](scrape.js)** → basic data (events, raids, research, eggs, rocket).
   - [pages/events.js](pages/events.js) scrapes the event list → `files/events.min.json`.
   - Other `pages/*.js` modules produce `files/raids.json`, `files/research.json`, `files/eggs.json`,
     `files/rocketLineups.json` (and `.min.json` variants).
2. **[detailedscrape.js](detailedscrape.js)** → visits each event URL for details.
   - Dispatches to `pages/detailed/*.js` based on `eventType`; always calls
     [pages/detailed/generic.js](pages/detailed/generic.js) for every event.
   - Writes temp files to `files/temp/`.
3. **[combinedetails.js](combinedetails.js)** → merges temp files into the `extraData` object.
   - Outputs the merged JSON files to `files/` and generates `files/calendars/*.ics`.

## Event structure

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

Event types with dedicated detail scrapers: `research-breakthrough`, `pokemon-spotlight-hour`,
`community-day`, `raid-battles`, `research`. All other types still receive `generic` extraData.

## Adding a new event-type scraper

1. Create `pages/detailed/{type}.js` exporting a `get(url, id, bkp)` function.
2. Wire it into [detailedscrape.js](detailedscrape.js): `require` it + add the `eventType` condition.
3. Add merge logic for `extraData.{type}` in [combinedetails.js](combinedetails.js).
4. Always provide a fallback to the `bkp` data in the `.catch()` block (backup comes from the `data` branch).

## Key patterns

- Use `JSDOM.fromURL()` for scraping.
- Temp file naming: `{eventID}_generic.json` or `{eventID}.json`.
- Always fall back to backup data in `.catch()` so a single failed page doesn't drop existing data.
- Normalize CDN image URLs to `cdn.leekduck.com/assets/`.
- Derive `eventID` from the event URL: `.split("/events/")[1]`.

## Local execution

```bash
npm install
npm run scrape:all   # runs scrape → detailedscrape → combinedetails in order
```

Generated `files/` output is gitignored and not committed; it is built only for the orphan `data`
branch, which the Actions job force-pushes. The `.catch()` fallbacks fetch backup/seed data from that
`data` branch at runtime.

## CI

[.github/workflows/scrape.yml](.github/workflows/scrape.yml) runs daily (cron `0 3 * * *`), on push to
`master`, and via manual dispatch. It runs all three scripts, then force-pushes only the generated files
to the orphan `data` branch. Do not depend on the `data` branch having normal repo history.

## Commit messages

- Use a conventional prefix: `fix:`, `feat:`, `chore:`, `refactor:`, or `docs:`.
- Keep the subject under 50 characters, imperative mood.
- Body: bullet points covering high-level functional changes and why they matter; a single concise
  bullet is fine for small changes. Avoid low-level implementation detail in the body.
- Do not add a `Co-Authored-By` trailer or any AI attribution footer to commit messages.
