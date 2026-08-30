# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
