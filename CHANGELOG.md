# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-14

### Added
- Year-round planning: succession schedules — `succession_days` on
  `goodearth_planting_window` returns every sowing to the last that still
  finishes, each with its typical finish and frost margin; Crops adds them to
  the ledger in one write (#128).
- Harvest log: cuts with an amount and unit, joined to their planting; a
  planting's first cut calibrates its heat target (#121).
- Offline field entry: plantings, notes, pests, wildlife and tasks recorded
  without signal wait in an outbox and are sent in order; the installed app
  opens with no signal (#120).
- The heat chart carries on through Dec 31 on this ground's typical year
  (`typical` on `goodearth_gdd_season_curve`), so a planting set out past the
  projection has a bar (#129).
- A drying line on the Dashboard — dew off, dry days, next rain —
  `goodearth_drying_window` (#109).
- Farm bundles: share a plot with every planting, pest, wildlife entry and task
  as a file, and import one as a plot of your own (#105, #106).
- Plot names and aliases editable on My Plots (#97); the life of a fungus, with
  disease words and further reading (#98).
- Dashboard: each trend carries its own label (#113); find an event by name and
  the chart centres on it (#114); a full-screen button, and Good Earth installs
  as an app (#116).
- For readers without JavaScript and for AI agents: a readable front door,
  robots.txt, sitemap.xml, llms.txt and JSON-LD (#119); first-connection
  instructions a grower's agent reads first (#122); an MCP Registry entry
  (`io.github.lonniev/goodearth-mcp`) and `/.well-known/ai-catalog.json` (#127).
- A block answers to any part of its name that only one block has. "North
  Farm" finds a block saved as "North Farm (east parcel)"; a word two blocks
  share is refused with every candidate named, never quietly narrowed to one.
  Retired ground is never reached by a loose name.
- The tool metadata says blocks may overlap or nest, and that an overlap is
  intended rather than a drawing error.

- `wetness` — leaf wetness estimated from hourly humidity and rain, with the
  shared run/accumulator primitives the disease models read. Every figure is
  labelled estimated and names its estimator; nothing here is measured.
- `disease` — five published extension models over those hours: Hutton (late
  blight), modified Mills (apple scab), Wallin severity values (early blight),
  botrytis wetness, and powdery-mildew conduciveness, which is the inverse
  case a naive wetness counter reads backwards. Conditions only — no product,
  rate or interval, anywhere, enforced by a test.
- `disease_window` — one hourly fetch for the season and one for the forecast,
  shared across every model in a call, plus `resolve_disease_models` so a
  stored `model` reference recomputes each season instead of freezing a date.
- `DiseaseCard` + `lib/diseaseRows` — the Dashboard's Trends card for wetness
  risk. Leads with what is true TODAY; the models that are quiet keep their
  place below, because risk that is absent is as useful as risk that is present.
  Each row opens onto the model's own criteria and citation, and says which
  crops it was developed for — every model runs on every block, so a flower
  grower meets "apple scab" and deserves to know it is about apples.
- Wet periods as washes on the GDD chart's date axis — solid for what the
  record saw, hatched for what the forecast implies. A wet period is a
  condition of the DAYS, not a point on the curve, so it is drawn with width
  and behind everything. The LAST and the NEXT per model, never the season's
  whole tally: twenty apple-scab washes across one plot is weather wallpaper.
- `lib/cropMatch` — a port of the service's `roster.norm`/`_matches`, so
  "Calendula officinalis" on the record meets "calendula" in a model's own
  "developed for" list. The Trends card now sets aside models no planting
  claims, and says out loud how many it set aside and why. Apple scab was
  being SHOWN to a flower farm with a caption apologising for it.
- The Crops ledger names, under each planting, the models claiming that crop
  and when each next fires. Good Earth is citing a model's scope against the
  record, never asserting that a crop gets a disease.
- `leaf_wetness` in the glossary, because the page now leans on the word
  "estimated" and a grower deserves to be able to look it up.
- `goodearth_disease_risk` — wet hours on a block and what each model makes of
  them, including which criteria were NOT met. Stateless and previewable:
  models travel as an argument and nothing is read from or written to the
  record. Ships unpriced.
- `sources.fetch_wetness_history` / `fetch_wetness_forecast` — hourly
  temperature, humidity, dew point and rain. History is PINNED to the 2 km
  feed rather than going through `_history_any_feed`, because a wet hour is a
  threshold reading and the reanalysis counts nearly three times as many of
  them at Panton.

### Changed
- A grower's season does not end on Dec 31: the calendar feed, roster review,
  calibration and task "season" read a rolling season, and a row's season is
  the year of its own date (#130). The planting window plans the coming season
  once this year's first frost has passed (#131). Sap is counted over the
  winter, Dec 1 – May 15; chill counts only winters that have finished (#132).
- The last sowing date walks back from the frost through this ground's typical
  heat day by day, not a season-long average rate (#128).
- Disease shows only the models for what grows on this ground, reads "clear"
  rather than "quiet", and is headed "Disease Estimates" (#99, #111).
- Tasks and Crops rows compacted; trash removes, a struck pencil cancels;
  tooltips wrap (#100–#104). Pages use the full width of the device (#118); the
  Almanac's charts draw at their card's width on a phone (#125).
- Grower-facing text no longer says where data is kept (#123).
- References names the feed the service actually asks FIRST. It described the
  ERA5 reanalysis at ~9 km as "the running season" while `_history_any_feed`
  has been trying the 2 km archived model runs before it — so the page named
  the fallback as the primary, on the page whose whole purpose is "not trust
  us, here is the feed". The 2 km feed was not listed at all. Both are there
  now, in the order they are asked, with the 30-vs-86 wet-hour disagreement
  between them stated.
- References gains NEWA as the reference implementation of the disease models
  — read for definitions and validation, never called — and six method
  entries: the wetness estimator with its own thresholds, and Hutton, Mills,
  Wallin, botrytis and powdery mildew each with the assumption inside it.
- `infection_period`, `severity_value` and `conducive` in the glossary.
- `disease.hutton` reports one period per WEATHER EVENT rather than one per
  overlapping pair of days. Hutton asks for two consecutive qualifying days, so
  a five-day wet spell held four such pairs — Frogdale read "13 periods" for
  what were six. A grower was being told the season was twice as bad as it was.
- `record_cache.wetness_history` keeps a season in CALENDAR-MONTH chunks rather
  than as one row per span. A cache key carries its span, so a key ending
  "today" is a different key tomorrow — a patron opening the page daily minted
  a fresh ~50 KB row every morning, and `MAX_ROWS_PER_PATRON` counts rows, so
  each one cost the same slot as a 2.5 KB daily row. Measured on Panton ground:
  63 KB of steady state per block per season, against 7-11 MB of single-use
  rows. Finished months never expire and are reused; only the current month is
  refetched.
- `pests.PUBLISHED_MODELS` now reads the wetness models from `disease.MODELS`
  rather than restating them, so the two lists cannot drift.
- `catalog.resolve_referenced_models` answers only for `usa-npn`. It used to
  claim any `model` reference, which would have had it report that USA-NPN
  publishes no dated layer for botrytis — a true sentence about a question it
  was never asked.

### Fixed
- One task per tap (#99); the plant picker picks on the iPad (#107); Export
  downloads on a desktop (#108); the chart's gesture hint always goes away
  (#110).
- The web app's MCP client no longer awaits a failed connection forever, which
  stranded every later call until a reload (#120).
- Feb 29 no longer breaks the frost and soil summaries; a first fall frost in
  January is found and ordered after December; a brood started in December is
  not re-dated to next December; a January cut is calibrated from its October
  set-out (#131). An October freeze belongs to the coming winter (#132).

## [0.1.0] - 2026-08-30

Initial scaffold — T1.

### Added
- `region` — the sampling engine every later tool is built on. Accepts a
  GeoJSON Polygon (bare geometry or Feature) or a `{lat, lon, radius_m}` pin,
  lays an ~800 m grid inside it, and reports aggregate plus spread. Sample
  count is capped and coordinates are range-checked before any upstream call.
- `sources` — Open-Meteo archive, forecast, and elevation clients. Each
  records its native resolution so no response claims precision the feed
  cannot support.
- `gdd` — degree-day accumulation with base/upper clamping, the ten-season
  normals band, projection at the recent rate, and terrain downscaling
  (lapse rate on both bounds; cold-air drainage on the daily minimum only).
- `season` — assembles the region season curve.
- `goodearth_gdd_season_curve` — the first priced tool.
- `frontend/` — Good Earth SPA scaffold. Sign-in (`NpubGate`), the proof
  envelope (`lib/mcp`, `inlineProof`, `sessionNsec`), and the Nostr profile
  panel are borrowed from the fleet, not reimplemented.
- 73 tests covering happy paths, degraded upstreams, and adversarial tool
  arguments.

### Notes
- Sample points are folded onto the archive's own ~9 km grid, so a distinct
  cell is fetched once rather than once per point; the normals band is a
  single span request sliced locally. A whole-region read is three upstream
  requests regardless of sample count — the first design fetched 58 and was
  rate-limited by Open-Meteo.
- The charter named PRISM 800 m normals as the spread source. PRISM serves
  raster formats only (`asc`, `nc`, `geotiff`) with no point JSON API, so
  spread is derived from 90 m SRTM elevation instead — finer than PRISM and
  one free JSON call.
