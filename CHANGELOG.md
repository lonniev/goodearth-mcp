# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- A pest is named from iNaturalist rather than typed and hoped for, so a row
  carries the creature's taxon and every later lookup has something to key on.
  It searches **animals**, not insects — this list already held a chipmunk and
  a slug — and a name the catalogue has not heard of still stands.
- The pest form fits one row less: captions on one line, boxes one height, a
  narrower base field, and the add button at the end of the fields instead of
  on a row of its own. It shows a bug rather than the word "Pest".
- "Modelled stages" is **Due on this ground**.
- Recording a cut is as tidy as recording seed: every caption above its
  control, every box one height, and the two buttons together at the top
  right. The date wore no caption at all while "How much" wore one, which is
  why nothing in that row lined up.
- A plant with seed on the shelf shows a full green seed, and one without shows
  an empty outline, so the ledger says which rows hold a packet without opening
  each one in turn — and says it by shape rather than by two inks that are hard
  to tell apart at the size they are drawn.
- Recording a cut is marked with a pair of secateurs rather than office
  scissors. Plain scissors on a row of actions read as "delete this", and
  taking a cut of a plant is the opposite of removing it. Credited on the
  References page, where the rest of this app's sources are.
- The seed row is one tidy form. Every field goes through one component, so
  the captions sit on one line and the boxes are one height — a date input, a
  select and a text box do not agree on a height by themselves, which is what
  made it look home-made. Its four controls — add a lot, remove one, cancel,
  save — are together at the top right of the form rather than scattered
  through it, and the plant is not named again inside its own row.
- The seed row asks for a packet the way a packet reads. Each field is as wide
  as what goes in it — a three-digit day count and a four-digit year no longer
  take a quarter of the row each; germination is a percent spinner; how much
  you hold is **one** field, "500 seeds", rather than a count and a unit asked
  for separately. "Tested on" is **Germination tested**, which says what was
  tested; "From" is **Supplier** and "Lot" is **Supplier's lot**; "On hand" is
  **Inventory count**. Variety offers back the varieties of that plant you have
  already named.
- The seed and the cut are Material Design glyphs in the page's own ink,
  where they were a chestnut and a pair of scissors in Apple's colours. The
  sowing date and the seed list no longer run into each other.
- A plant's seed is stated on the plant's own row. "Seeds on hand" was a
  section of its own, with a dropdown re-picking a plant the ledger already had
  on screen, and a saved packet whose only gesture was a jump back to the form
  to add a second row for a plant that was already there. Open a plant on the
  **Plant ledger** — the Crop ledger, renamed — and its sowing date and its
  packet are there.
- Every plant on the page is called a plant.
- The Dashboard and the Almanac are read together, so each now starts the
  other's reading in the background while the grower is on the first one. Flip
  across and the page is already there. A page revisited within a few minutes
  is served from what was already asked for rather than asked again — so a
  grower who moves between the two several times pays one fare each instead of
  one per visit. A reader who opens only one of the two pays for a reading of
  the other they never look at.
- The heat chart gives its top corner back to the season. "MEDIAN FIRST FROST"
  ran nearly a fifth of the chart's width in words; it is now one ice-crystal
  mark sitting on the line it names. And today's dot no longer spells out
  "today" — the dot says that, and a tick on the date axis says it again, so
  all that is written is the figure a reader cannot get from the picture.
- The historical range now runs to the right-hand edge of every chart instead
  of stopping at today. A normal range is history, and history has a figure
  for November as readily as for September — so the forecast and the
  projection, the part a grower is actually asking about, finally have
  something behind them to be read against. Nothing else about the band
  changes: same ten seasons, same min/mean/max, same fill.

### Added
- A planting records **the day its seed went in**, beside the day it was set
  out. "When to sow" already predicted that pair; now the grower can record
  against it. The sowing shows on the heat chart as a dated mark — a calendar
  fact, kept apart from the heat the chart counts.
- A packet may name the planting it was sown from, or not: cloves, crowns and
  nursery starts have a day they went in and no packet at all.

## [0.3.0] - 2026-09-18

### Added
- **Rotation on Crops** — what grew on this plot, season by season, grouped by
  plant family, including plantings since cleared from the ledger. One paid
  read, and only when asked (#135). Every crop in it is a button: a tap fills
  the add-a-planting form with that plant and the figures it was given last
  time, and nothing is saved until the grower picks the date (#138).
- **Seed lots** — what the grower actually holds seed of: crop, variety, days
  to maturity, germination and when it was tested, the year it was packed for,
  quantity, supplier and lot number. Everything but the crop is optional. Each
  sowing row shows its seed, and farm bundles carry the lots with them (#137).
- **Look it up** beside Days to maturity, which fills that one field from
  Growstuff. Only that field: germination and its test date belong to the
  packet in the grower's hand, and no catalogue holds them (#139).
- **Seeds and Sowing, named and joined** — a drawer and a calendar, not one
  feature. Tap a lot to draft a planting from it; a packet's days never become
  a heat target, because they are different clocks (#140).

### Changed
- The Dashboard opens faster, and asks the weather service for far less to do
  it. A season still running is now read in two pieces — the months that have
  finished, kept without expiry, and the few days since the month began — so
  the second morning reads a handful of days instead of the whole season
  again. Terrain is read once for the life of the ground rather than twice per
  page. Two tools asking the same question at the same moment now share one
  request. And every feed rides one pooled connection instead of opening a
  fresh one, twenty times a load (#143).
- The Dashboard draws the heat curve first and reads its trends after, rather
  than starting five calls at once. The chart is what a grower opened the page
  for; the trends arrive under it (#143).

### Fixed
- A busy weather service no longer reads as a broken one. Open-Meteo's HTTP 429
  is waited out and asked again rather than reported, and one refusal holds
  back every other request sharing that provider's quota instead of becoming a
  second burst. A rate refusal is no longer failed over to the sibling feed —
  both hosts bill the same caller, so the fallback only spent what was left and
  reported its own refusal, which is how the Dashboard came to say
  "could not read the season's observations: archive-api.open-meteo.com
  returned HTTP 429" (#141).
- When upstream still will not answer, the last reading of that ground is
  served instead of an error, labelled with when it was actually taken — the
  Dashboard shows "read 9:14 · weather from 6:12". A page with this morning's
  season on it beats a page with no season on it; a page that hides which one
  it is showing beats neither (#141).
- Turning the bees off keeps them off. Unticking them in Preferences made them
  vanish and then come back, with the box still unticked (#136).

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
