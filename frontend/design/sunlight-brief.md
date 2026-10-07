# Good Earth Sunlight — design brief

**Task for Claude Code.** Add a Sunlight feature to Good Earth: a paid tool, `goodearth_sunlight`, and a Sun layer on the Plots map. It answers two questions about any block, anywhere in the world:

1. *Garden light.* How many hours of direct sun does each part of this ground get, month by month, and is it full sun, part shade or full shade?
2. *Solar panels.* Where on this ground would a fixed panel array produce the most, how much per kW installed, and how much of the open-sky yield does shading take away?

The answer must be global. Vermont's lidar is a nice thing to have in one state; it is never a dependency.

The design mock is `frontend/design/sunlight-mock.html` (attached to this task). It runs a real shadow calculation over an illustrative scene, so the visuals, the scales and the interactions in it are the intended ones.

---

## What the grower sees

Patterns taken from the solar and shade tools people already know, without any of their financing material:

| Pattern | Seen in | Good Earth use |
|---|---|---|
| Heat overlay on aerial imagery, yellow for sun and dark for shade | Google Project Sunroof, Aurora irradiance map | The Sun layer on the satellite map, clipped to the block |
| Readout that follows the finger: solar access %, monthly values | Aurora (hover readout, annual and monthly toggle) | Tap a spot to get its card |
| Hours of direct sun for a chosen date, and an annual total | ShadeMap ("Hours in the sun" layer) | Month slider over the Garden view |
| Sky dome with the horizon silhouette and the solstice sun paths | Solmetric SunEye, PVGIS horizon chart, Sun Seeker | The spot card's sky chart |
| Monthly bar chart of production | PVWatts, Global Solar Atlas | Monthly bars on the spot card |
| Solar access, TOF and TSRF as percentages | Aurora / industry shade reports | We report **solar access** only; tilt and azimuth are the grower's inputs |

### The Sun layer on the map

- A **☀️ Sun** button sits beside **🌧️ Radar** on `FieldMap`, and the same layer is offered on `PlotsMap` for the active plot. Turning it on opens a bottom panel, in the same place and style as the radar panel.
- The panel has two views:
  - **Garden light.** Hours of direct sun per day for the chosen month. The default month is June. The legend shows the three classes: full sun is 6 hours or more, part shade is 3–6, and full shade is under 3.
  - **Solar panels.** kWh per kW installed per year, for a fixed panel with the chosen tilt and facing. The defaults are equator-facing at a tilt near the latitude, capped at 40°.
- A month slider runs from January to December. A leaf chip reads "Bare trees Nov–Apr" and lets the grower see the same month in full leaf.
- The overlay is clipped to the block polygon at about 70% opacity, so the trees in the imagery stay visible around it.
- Tapping inside the block opens the **spot card**:
  - a light-class chip;
  - the sky dome, showing the terrain silhouette and the tree silhouette in different colours, with the June, March/September and December sun paths and hour dots, and the blocked stretches dashed;
  - twelve monthly bars of direct sun hours, with lines at 3 and 6 hours;
  - the solar figures: kWh per kW per year, solar access %, and the month of least light;
  - a provenance line in the same form as the other cards.
- Below the map sits the **block summary**. It shows a stacked bar of the class shares for the chosen month, the full-sun share for each of the twelve months, and "Best place for panels", whose **Show it** button selects that cell.

### Copy rules

- The tool states measurements and classes. It never says what to plant, consistent with "It does not publish agronomy". The full sun / part shade / full shade thresholds are the standard nursery-label definitions, and the tool cites them.
- Solar figures are a **screening estimate**, and the card says so in one plain line.

---

## The tool

```
goodearth_sunlight(
    block: str,                       # id, name or alias, like every other tool
    month: int | None = None,         # 1–12; None returns all twelve
    panel_tilt_deg: float | None = None,     # default: min(|lat|, 40)
    panel_azimuth_deg: float | None = None,  # default: 180 in the north, 0 in the south
    point: str | None = None,         # "lat,lon" inside the block → the spot card
    detail: "summary" | "grid" = "summary",
    npub, dpop_token,
) -> dict
```

The response includes:

- `light`:
  - per month, the share of the block in each class;
  - the median direct-sun hours per day;
  - the spread, as p10 and p90;
  - the sunniest and shadiest sample points, with their coordinates.
- `solar`:
  - open-sky and shaded kWh per kWp per year for the given tilt and azimuth;
  - `solar_access_pct`;
  - monthly kWh per kWp;
  - `best_point` with its yield and access.
- `point` (only when `point` is given): the horizon in 72 bins of 5°, split into `terrain_deg` and `canopy_deg`, plus monthly sun hours, the class and the solar figures.
- `grid` (only when `detail="grid"`):
  - bounds and cell size;
  - per-cell arrays of June hours, December hours and annual kWh per kWp, packed as base64 uint8 or uint16 with scale factors, ready for the overlay;
  - optionally all twelve months.
- `sources`:
  - the canopy dataset, with the **observation date of the canopy imagery under this block**, which Meta publishes as a GeoJSON alongside the tiles;
  - the DEM;
  - the radiation feed and the years it averages.
- `note`: what is estimated and what is not. See the caveats below.

Pricing: a heavy tool, set in Pricing Studio like any other new tool. The first call on a block pays for the horizon computation; later calls read the cache. The price can reflect that, or the tool can stay at one price and simply be cheaper to serve.

---

## Algorithm

### 1. Sample the block

Reuse `region.py`, but on a finer grid than the 90 m terrain grid. Use 2–5 m cells, with the spacing chosen so a block has at most about 2,500 cells. The summary aggregates over the cells and reports the spread, exactly as the other tools do.

### 2. Build the obstruction surface

- **Terrain, near and far.** Use Copernicus GLO-30. It is a COG on S3 (`copernicus-dem-30m`, eu-central-1), anonymous, global, and free under the Copernicus licence. Read the cells under the block plus a far-field ring out to about 20 km; use GLO-90 beyond 2 km to keep the read small.
  - Note that the Copernicus DEM is a surface model: radar partly sees the forest top. For the near field, smooth the ground over about 90 m and take the trees from the canopy map. Say so in the code comment.
- **Trees, within about 250 m.** Use Meta/WRI High Resolution Canopy Height Maps at 1 m, global, CC BY 4.0, at `s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/chm/`. Tiles are named by zoom-9 quadkey, and observation dates come as GeoJSON. The published mean absolute error is 2.8 m.
  - **Risk to check first:** GitHub issue facebookresearch/HighResCanopyHeight#7 reports the global tiles are *not valid COGs*. Before building anything else, measure a 500 m windowed read with GDAL `/vsis3/` from Horizon: the time taken, the bytes transferred and the HTTP requests.
  - If windowed reads are fast enough, use them directly. Otherwise, in order of preference:
    - (a) Read the same dataset through Google Earth Engine `computePixels`. Earth Engine hosts it as a community dataset. The service-account key arrives through Secure Courier as an operator credential, the same pattern the other operators use.
    - (b) Use the ETH global canopy height map (10 m, Lang et al. 2023) for the near field.
    - (c) Extract and downsample once per block, then cache the 2 m crop.
  - Record which path was used in `sources`.
- **Leaf state.** The canopy map does not distinguish deciduous from evergreen.
  - Use a land-cover forest-type layer to tag each tree pixel. Copernicus Global Land Cover 100 m has deciduous and evergreen classes; check its licence.
  - Model deciduous canopy as fully blocking in leaf-on months and about 50% transmissive in leaf-off months. Make the 50% a named constant and cite it.
  - Leaf-on months are those whose 30-year mean daily temperature is at least 10 °C, from the normals Good Earth already holds. The months therefore follow the block's own climate, not a calendar.

### 3. Horizon per cell

For each cell, cast 72 rays at 5° azimuth steps and take the highest elevation angle for each:

- **Near field:** canopy plus smoothed ground, stepping about 2 m out to 250 m.
- **Far field:** DEM only, stepping out to about 20 km, with the earth-curvature correction.

Keep terrain and canopy separate, because the spot card draws them in different colours and the leaf model applies to canopy only.

**Cache the horizon per block geometry hash. It does not change with the weather.** Recompute only when the block is redrawn or the canopy source changes.

### 4. Sun position

Use NOAA's solar position algorithm (`almanac.py` already has declination and day length). Take every 10 minutes, on every day or on the 15th of each month; the 15th is enough for the summary. Use the block's true longitude, so solar time is right.

### 5. Garden light

For each cell and month:

> direct-sun hours per day = Σ Δt over daylight minutes where sun elevation > horizon(azimuth)

Weight by canopy transmittance where the blocking ray hits canopy rather than terrain. Classify the result as full sun (≥ 6 h), part shade (3–6 h) or full shade (< 3 h).

### 6. Solar yield

- **Radiation input:** a typical year built from Open-Meteo's archive. Take 10 years of hourly `direct_normal_irradiance`, `diffuse_radiation` and `shortwave_radiation` (ERA5 or IFS, global, 1940 onward) and average them by month and hour.
  - Cache this per weather cell; it is climatology.
  - Do *not* use Open-Meteo's Satellite Radiation API: it has no North American coverage yet.
- **Plane of array:** use the isotropic sky model:
  - `POA = DNI·cosθ·S + DHI·SVF·(1+cosβ)/2 + GHI·ρ·(1−cosβ)/2`
  - `S` is 1 when the sun clears the horizon, the canopy transmittance when it is behind leaves, and 0 behind terrain.
  - `SVF` is the sky-view factor from the horizon profile: the mean of cos²(h) for a horizontal surface, with a tilted-panel variant if Claude Code prefers.
  - `ρ = 0.2`.
- **Yield:** `kWh/kWp = POA (kWh/m²) × PR`, with a performance ratio of 0.80 stated in `note`. PVWatts' default 14% system losses plus inverter losses come to about the same.
- **Solar access %** = shaded POA ÷ open-sky POA, the same definition Aurora uses.

### 7. Cross-check in tests

PVGIS PVcalc accepts a `userhorizon`: 48 values, clockwise from north. It also has an NSRDB database for the Americas and SARAH for Europe and Africa. Add a test, skipped offline, that sends a computed horizon to PVGIS and checks Good Earth's annual kWh/kWp falls within about 10%. Add one fixture each for:

- a Vermont block;
- a German block;
- a southern-hemisphere block, to check the azimuth convention.

Use pvlib only in the tests if needed.

### 8. Field reports calibrate it

Add an observation shape such as *"this bed is in direct sun from 9 to 2 in June"*. `calibration.py` already turns reports into corrections once several agree. For sunlight, a report adjusts the cell's horizon in the reported azimuth range. That is the honest fix for a tree cut or planted since the imagery date.

---

## Dependencies and runtime

- The service is pure Python today. This needs `numpy`. A raster reader is also needed: `rasterio` gives `/vsis3/` windowed reads but brings GDAL wheels of roughly 25 MB, while `tifffile` plus HTTP range requests is lighter if the COG reads are clean. Claude Code should choose after the canopy spike and say why in the PR.
- Bound the cost: at most 2,500 cells × 72 azimuths × about 125 near-field steps. That is fine in numpy and slow in pure Python. Cache both the horizon and the radiation climatology.

## Caveats the tool states

- The canopy imagery is several years old; `sources` gives the date. Trees cut or grown since are not in it, and field reports correct that.
- The canopy height error is a few metres, and small ornamental trees can be missed.
- Buildings are not modelled in the first version. Overture or OSM building footprints with height are a natural second step, and ShadeMap shows the pattern.
- For panels this is a screening estimate, not a site survey.

## Order of work

Each step is shippable on its own:

1. **Canopy access spike.** Measure, choose the path and write it up in the PR.
2. **Horizon and Garden light,** in the summary form only.
3. **Solar yield** and the PVGIS cross-check tests.
4. **`detail="grid"`** and the Sun layer on `FieldMap` and `PlotsMap`.
5. **The spot card** and the block summary.
6. **Field-report calibration** for sunlight.
7. **Follow-ups for Scout:**
   - Update the Shopify listing and the MCP catalog entry.
   - Draft an eXcalibur post along the lines of *"Is this corner sunny enough for tomatoes? Is that slope worth a solar array?"*

## Sources

- Meta and WRI canopy height map, announcement: https://sustainability.atmeta.com/?p=5573
- AWS Open Data registry entries:
  - https://github.com/awslabs/open-data-registry/blob/main/datasets/dataforgood-fb-forests.yaml
  - https://github.com/awslabs/open-data-registry/blob/main/datasets/copernicus-dem.yaml
- Canopy tiles not valid COGs: https://github.com/facebookresearch/HighResCanopyHeight/issues/7
- Open-Meteo historical weather API (radiation variables): https://open-meteo.com/en/docs/historical-weather-api
- Open-Meteo Satellite Radiation API (no North America yet): https://open-meteo.com/en/docs/satellite-radiation-api
- PVGIS horizon tool: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/pvgis-tools/horizon-profile_en
- pvlib PVGIS client (`userhorizon`, `raddatabase`): https://pvlib-python.readthedocs.io/en/latest/_modules/pvlib/iotools/pvgis.html
- Aurora irradiance map: https://help.aurorasolar.com/hc/en-us/articles/21137017211411-How-to-leverage-an-irradiance-map
- Aurora definitions of solar access, TOF and TSRF: https://help.aurorasolar.com/hc/en-us/articles/115005927847-Key-Terms-Irradiance-Solar-Access-TOF-and-TSRF
- ShadeMap: https://shademap.app/help
- Sun Seeker: https://apps.apple.com/us/app/sun-seeker-sunlight-tracker/id330247123
