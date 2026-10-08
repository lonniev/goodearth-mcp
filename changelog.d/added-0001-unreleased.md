- Sunlight, first cut: `goodearth_sunlight(block, month)` answers how many
  hours of direct sun each part of a block gets, month by month. The block is
  rasterised at 2–20 m (about 2,500 cells) and from every cell 72 rays find
  the highest ground to 20 km (Copernicus GLO-30, the earth's curve taken off)
  and the highest tree within 250 m (the Meta/WRI 1 m canopy map, global);
  the sun's path on the 15th of each month (NOAA's solar position) is then
  counted in ten-minute steps wherever it clears that line. Per month: the
  share of the block in full sun (6 h+), part shade (3–6 h) and full shade
  (under 3 h) — the nursery-label definitions — the median hours with p10 and
  p90, and the sunniest and shadiest spots. Bare deciduous crowns pass half
  the beam (evergreens none, from the Copernicus land-cover map); a month is
  in leaf when the block's own ten-year normals reach 50 °F. The horizon is
  cast once per outline and remembered in the weather cache; the first call
  on a block takes some seconds, later ones under one. `sources` carries the
  month the canopy imagery was taken. Measurements and classes only, never
  what to plant. Grid, solar yield, the Sun map layer and the spot card
  follow in later cuts.
- Sunlight, second cut: `solar` in the same answer — what a fixed panel
  array would make on each part of the block. A typical year is averaged
  from ten years of the ERA5 archive's hourly radiation (remembered per
  0.1° cell), put on the panel with the isotropic sky model at the given
  tilt and facing (defaults: toward the equator, tilted at the latitude up
  to 40°), with each cell's horizon deciding when the beam arrives and how
  much sky the diffuse light has; a performance ratio of 0.80 gives AC per
  kW installed. Reports open-sky and shaded kWh/kWp per year (median, p10,
  p90), solar access — shaded ÷ open-sky, the shade-report figure — the
  monthly open-sky yield and the best place for panels. A screening estimate,
  said so in the answer. Cross-checked by hand against PVGIS 5.2 with the
  same horizon (`scripts/sunlight_pvgis_check.py`): within 1 % in Vermont
  and Germany, 6 % in Canberra, against the brief's 10 %.
- Sunlight, third cut: the map. `goodearth_sunlight(detail="grid")` packs
  every cell — hours by month in and out of leaf, kWh/kWp, solar access, and
  each cell's own horizon — so a map can drape the block and answer a tap
  without another call; `point="lat,lon"` is one spot's card for an agent.
  On the Plots page a ☀️ **Sun** pill over the map lays the block's light
  over it (honey for full sun, indigo for full shade), with a month slider,
  a leaf chip (🍂 bare trees Nov–Apr / 🌳 full leaf all year) and a switch
  to the solar view where ◆ marks the best place for panels. A tap inside
  the block opens that spot's card beside the map: its class, hours today,
  a sky dome with the ground and tree horizons and the sun's path in June,
  at the equinox and in December, the twelve months as bars, the panel
  figure, the month with least light, and the sources. Below the map, the
  block in one reading: its shares in sun and shade this month, the share in
  full sun by month, and the best place for panels with a **Show it** that
  goes there. The grid is held in the page cache like every other answer.
- Sunlight, fourth cut: field reports correct it. An observation of kind
  `sunlight` — *this spot was in sun (or shade) from 09:00 to 14:00 on the
  14th of June* — is a measurement of the sky line: between those clock
  times the sun crossed known azimuths at known heights, so the horizon
  there is below them (sun) or above them (shade). `goodearth_sunlight`
  reads the block's reports on every call and, where three agree on a spot,
  its hours and its light, moves that spot's horizon: a sun report lowers
  the ground and tree lines to just under the sun, a shade report raises the
  tree line to just over it — the tree cut or planted since the canopy
  imagery, which is itself never changed. The median report sets the bound,
  the reports apply to the cells within a phone's fix of the spot, and the
  answer's `calibration` accounts for every report and what it moved. Clock
  times are read in the block's own zone (fetched once from the forecast
  feed and remembered; Daymet names none). A malformed report is refused at
  the write with its shape named; `goodearth_calibration` counts sunlight
  reports and points at the tool that reads them.
- A GeoTIFF range reader (`rasters.py`) with no GDAL: the canopy tiles are
  not cloud-optimised (one row per strip), but adjacent strips merge into a
  single range request, so a 500 m window is one 7.6 MB read. Adds `numpy`,
  `tifffile` and (below Python 3.14) `zstandard`.
- Companions, from the Flora ledger. One more glyph on a planting opens a row
  with two kinds of answer. **Synergy** reads the planting's family and genus
  from iNaturalist and applies published companion-planting rules — nitrogen
  fixers beside heavy feeders, open flowers that feed the wasps that take
  aphids, alliums that mask a carrot from its fly, walnut and fennel that
  poison the ground beside them, the same family sharing its pests — and
  every row names its mechanism or its tradition and a citation. **Design** is
  arithmetic over three new optional planting fields — flower colour on an
  eight-hue wheel, height in inches, bloom months — complementary, analogous,
  foil; layered or side by side; blooming together or not. Candidates are this
  plot, then what the grower has grown elsewhere or retired, then a few
  labelled examples; a planting with no species chosen is reported unplaced,
  never guessed into a family. A tap sends a companion to the planting form to
  be confirmed. New tool `goodearth_companions(block, plant, kind)`.
  A refusal — no species chosen, no colour recorded — costs nothing.
- Coupons on the Account page: the shared `CouponsPanel` from @tollbooth-dpyc/web,
  in Good Earth's dress. A grower redeems an operator's code once and the
  discount applies on its own to later paid calls. The page had opted out.

- Fungi are named on the plant page. Its species box searches plants and
  fungi together, so a shiitake log goes on the ledger like any planting, and
  Community Observations there offers the neighbourhood's fungi beside its
  plants. The Fungi chip has left Fauna: one home, not two.
- A planting records **the day its seed went in**, beside the day it was set
  out. "When to sow" already predicted that pair; now the grower can record
  against it. The sowing shows on the heat chart as a dated mark — a calendar
  fact, kept apart from the heat the chart counts.
- A packet may name the planting it was sown from, or not: cloves, crowns and
  nursery starts have a day they went in and no packet at all.
