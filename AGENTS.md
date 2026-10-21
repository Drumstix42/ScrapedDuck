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
- Node version is pinned in [.nvmrc](.nvmrc) (current LTS); CI reads it too. jsdom 30 needs Node
  `^22.22.2 || ^24.15.0 || >=26`.
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
  eventID, name, eventType, eventTypes, heading, link, image, start, end,
  extraData: {
    generic: { hasSpawns, hasFieldResearchTasks },  // ALL events
    bonuses: [{ title, description, startTime, endTime, items: [{ text, image, schedule }], notes }],  // ALL events
    spawns: [{ title, subtitle, description, schedule, pokemon: [{ name, image, canBeShiny }], notes }],  // ALL events
    spotlight: {...},      // pokemon-spotlight-hour
    communityday: {...},   // community-day
    raidbattles: {...},    // raid-battles (and event-style pages with raids)
    breakthrough: {...},   // research-breakthrough
    promocodes: [...],     // research (only when the page has codes)
    season: {...},         // season
    raidSchedule, spotlightSchedule  // event-style pages, flattened in
  }
}
```

- `eventType` is the primary type, as shown on the events list. It drives detail-scraper dispatch
  and per-type calendars.
- `eventTypes` is every type tagged on the event page (e.g. `["event", "location-specific"]`), scraped
  by [pages/detailed/generic.js](pages/detailed/generic.js). It always starts with `eventType` and has no duplicates.
- `bonuses` is parsed for every event by [pages/detailed/generic.js](pages/detailed/generic.js) via
  [pages/bonuses.js](pages/bonuses.js), from the page's "Bonuses" section only (one group per
  `.bonus-list`; `[]` when there is none). Spotlight Hours have no such section, so
  [combinedetails.js](combinedetails.js) mirrors `spotlight.bonus` into it as a single item (empty
  `image`). Event-style pages also append a `"Raids"` group for raid notes (e.g. Crowned Sword
  Energy) about a boss raided all event long; a note about a day-specific boss only goes on that
  day's `raidSchedule` `bonuses`. `spotlight.bonus` and `communityday.bonuses` / `bonusDisclaimers`
  are kept as-is for compatibility.
- `spawns` is parsed for every event the same way, via [pages/spawns.js](pages/spawns.js), from the
  "Spawns" section (one group per `.pkmn-list-flex`; `[]` when there is none). `title` is the
  outermost sub-heading (the topic, e.g. "Mighty Pokémon"); a label heading nested under it
  ("Solid as Steel Hour") is the `subtitle`, while a nested date heading ("Saturday, November 14")
  goes into `schedule`. Consecutive lists with the same `title`, `subtitle` and `schedule` (e.g. a
  "You might also encounter Skarmory!" follow-up) are merged into one group, joining their
  descriptions/notes. `communityday.spawns` is kept as-is for compatibility.
- `schedule` (on spawn groups and bonus items) is a list of windows parsed by
  [pages/schedule.js](pages/schedule.js): `[{ startDate, startTime, endDate, endTime, allDay, everyDay }]`.
  Dates/times keep the page's wording; `null` means no limit on that side. Minior's "from 5:00 p.m.
  to 9:00 p.m. local time each day" → `{ startDate: null, startTime: "5:00 p.m.", endDate: null,
  endTime: "9:00 p.m.", allDay: false, everyDay: true }` (`everyDay` is set on every undated window:
  it repeats on each event day); a "Saturday, November 14" heading → that date with null times,
  `allDay: true`, `everyDay: false`. `[]` means the whole event.
  A bonus item only gets a schedule when its own text states one; a group-wide window stays in the
  group's `startTime` / `endTime`.
- Dedicated detail scrapers: `research-breakthrough`, `pokemon-spotlight-hour`, `community-day`,
  `raid-battles`, `research`, `season`. `event`, `raid-day`, `raid-hour`, `pokemon-go-fest`,
  `pokemon-go-tour` and `wild-area` use the event-style scraper
  [pages/detailed/event.js](pages/detailed/event.js). Each boss there has a `raidType` category
  (`"Raid"`, `"Shadow"`, `"Mega"`, `"Super Mega"`, `"Primal"`, `"Max Battle"`, `"Gigantamax"`)
  and a numeric `tier` (star count from the heading, e.g. "Two-Star Max Battles" → `2`; `null`
  when the page names none; Gigantamax defaults to `6`), parsed by
  [pages/raidtype.js](pages/raidtype.js); `files/raids.json` uses the same two fields. Max Battles on those pages land in
  `raidSchedule` / `raidbattles` with a `Dynamax` / `Gigantamax` name prefix. Daily one-hour windows listed under dated headers
  ("Raid Hour: Monday, November 9", or "Five-Star Max Battles: Wednesday, November 11" after a
  "featured in Max Battles from …" paragraph) fill that day's `raidHours`. A Raid Hour boss that
  is already in an event-wide tier list (e.g. "Five-Star Raids") goes only in `raidHours`, not
  that day's `bosses`, since it isn't exclusive to that day. All other types still receive
  `generic` extraData.

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
- Run every event type slug through [pages/eventtype.js](pages/eventtype.js) (`é`→`e`, and maps
  slugs LeekDuck has renamed, e.g. `ticketed`→`ticketed-event`). Add new aliases there.
- Derive `eventID` from the event URL: `.split("/events/")[1]`.

## Local execution

```bash
nvm use              # or `fnm use`; picks up .nvmrc
npm install
npm run scrape:all   # runs scrape → detailedscrape → combinedetails in order
```

Generated `files/` output is gitignored and not committed; it is built only for the orphan `data`
branch, which the Actions job force-pushes. The `.catch()` fallbacks fetch backup/seed data from that
`data` branch at runtime.

## CI

[.github/workflows/scrape.yml](.github/workflows/scrape.yml) runs daily (cron `0 3 * * *`), on push to
`master`, and via manual dispatch. It uses the Node version from [.nvmrc](.nvmrc), runs all three scripts, then force-pushes only the generated files
to the orphan `data` branch. Do not depend on the `data` branch having normal repo history.

## Commit messages

- Use a conventional prefix: `fix:`, `feat:`, `chore:`, `refactor:`, or `docs:`.
- Keep the subject under 50 characters, imperative mood.
- Body: bullet points covering high-level functional changes and why they matter; a single concise
  bullet is fine for small changes. Avoid low-level implementation detail in the body.
- Do not add a `Co-Authored-By` trailer or any AI attribution footer to commit messages.
