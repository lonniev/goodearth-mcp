"""Assemble the region season curve — the answer T1 sells.

Composes the region grid, the upstream feeds, and the degree-day maths into
one response: accumulation to date across the region, the band of recent
seasons it should be read against, a forecast extension, and a projection
past the forecast horizon.

Pure domain logic. The server module adds billing and identity.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import gdd, record_cache, sources
from goodearth_mcp.region import Region, cluster_to_grid, summarize

# Sane bounds on a crop base temperature. 50 °F is the field-corn convention,
# 32 °F suits cool-season crops. Outside this range the caller has almost
# certainly sent Celsius, and silently accepting it would return a curve that
# looks plausible and is wrong.
MIN_BASE_F = 20.0
MAX_BASE_F = 80.0

NORMALS_SPAN_YEARS = 10


class SeasonError(ValueError):
    """A caller's request cannot be answered as asked."""


def _validate_base(base_f: float) -> float:
    try:
        base = float(base_f)
    except (TypeError, ValueError) as exc:
        raise SeasonError(f"base_temp must be a number in °F, got {base_f!r}") from exc
    if not MIN_BASE_F <= base <= MAX_BASE_F:
        raise SeasonError(
            f"base_temp must be between {MIN_BASE_F:.0f} and {MAX_BASE_F:.0f} °F, got {base:.1f} — "
            "Good Earth works in Fahrenheit"
        )
    return base


async def _elevations(region: Region) -> tuple[list[float] | None, str | None]:
    """Terrain height per sample point, or ``None`` with a reason if unavailable."""
    try:
        elevs = await sources.fetch_elevations(
            [p.lat for p in region.points],
            [p.lon for p in region.points],
        )
        return elevs, None
    except sources.UpstreamError as exc:
        return None, str(exc)


async def region_season_curve(
    region: Region,
    base_f: float,
    today: date | None = None,
    forecast_days: int = 7,
    projection_days: int = 75,
) -> dict[str, Any]:
    """Season-to-date GDD across ``region``, with band, forecast and projection."""
    base = _validate_base(base_f)
    today = today or datetime.now(UTC).date()
    start = gdd.season_start(today)

    elevs, elev_note = await _elevations(region)

    # The archive resolves ~9 km, so every sample point on one farm sits in
    # the same cell and would return identical numbers. Fetch each distinct
    # cell once; the per-point variation comes from terrain, not from asking
    # the same grid square 48 times (which is also what trips its rate limit).
    cells, cell_of_point = cluster_to_grid(region.points, sources.HISTORY_RESOLUTION_M)

    history_task = record_cache.daily_history(
        [c.lat for c in cells],
        [c.lon for c in cells],
        start.isoformat(),
        today.isoformat(),
    )
    forecast_task = sources.fetch_daily_forecast(
        region.centroid.lat, region.centroid.lon, forecast_days
    )
    # Normals take the 1 km feed where the running season cannot: they are one
    # point over a span that has entirely happened, which is exactly what
    # Daymet serves and nine times finer than the archive underneath it.
    normals_task = record_cache.normals_history(
        region.centroid.lat,
        region.centroid.lon,
        start.replace(year=today.year - NORMALS_SPAN_YEARS).isoformat(),
        start.replace(year=today.year - 1).replace(month=12, day=31).isoformat(),
    )

    history, forecast, normals_raw = await asyncio.gather(
        history_task, forecast_task, normals_task, return_exceptions=True
    )

    if isinstance(history, BaseException):
        raise SeasonError(f"could not read the season's observations: {history}")
    if not history:
        raise SeasonError("the archive returned no data for this region")

    # ── Per-point curves, terrain-corrected off each point's own cell ────
    region_max_elev = max(elevs) if elevs else 0.0
    per_point: list[list[float]] = []
    dates: list[str] = []

    cell_series: list[tuple[list[str], list[float | None], list[float | None], float] | None] = []
    for record in history:
        try:
            d, tmax, tmin = sources.daily_series(record)
        except sources.UpstreamError:
            cell_series.append(None)
            continue
        elev = record.get("elevation")
        cell_series.append((d, tmax, tmin, float(elev) if isinstance(elev, (int, float)) else 0.0))
        if not dates:
            dates = d

    for i in range(len(region.points)):
        ci = cell_of_point[i] if i < len(cell_of_point) else 0
        cell = cell_series[ci] if ci < len(cell_series) else None
        if cell is None:
            continue
        _, tmax, tmin, grid_elev = cell

        if elevs is None or i >= len(elevs):
            per_point.append(gdd.accumulate(tmax, tmin, base))
            continue

        adj_max: list[float | None] = []
        adj_min: list[float | None] = []
        for hi, lo in zip(tmax, tmin, strict=False):
            if hi is None or lo is None:
                adj_max.append(None)
                adj_min.append(None)
                continue
            a, b = gdd.downscale(hi, lo, elevs[i], grid_elev, region_max_elev)
            adj_max.append(a)
            adj_min.append(b)
        per_point.append(gdd.accumulate(adj_max, adj_min, base))

    if not per_point:
        raise SeasonError("no sample point returned a usable temperature record")

    totals = [c[-1] for c in per_point if c]
    spread = summarize(totals)
    mean_curve = gdd.band(per_point)
    mean_series = [d["mean"] for d in mean_curve] if mean_curve else []

    # ── Normals band from the same window in prior seasons ───────────────
    normals_curves: list[list[float]] = []
    normals_source = "Open-Meteo archived model runs"
    normals_resolution = sources.HISTORY_RESOLUTION_M
    if not isinstance(normals_raw, BaseException) and normals_raw:
        normals_records, normals_source, normals_resolution = normals_raw
        try:
            n_dates, n_max, n_min = sources.daily_series(normals_records[0])
            normals_curves = gdd.yearly_curves(
                n_dates, n_max, n_min, today, NORMALS_SPAN_YEARS, base
            )
        except (sources.UpstreamError, IndexError):
            normals_curves = []

    normals_band = gdd.band(normals_curves)
    normals_today = normals_band[min(len(mean_series), len(normals_band)) - 1] if normals_band and mean_series else None

    # ── Forecast extension at the centroid ───────────────────────────────
    forecast_block: dict[str, Any] | None = None
    running = mean_series[-1] if mean_series else 0.0
    if not isinstance(forecast, BaseException):
        try:
            f_dates, f_max, f_min = sources.daily_series(forecast)
            fc = gdd.accumulate(f_max, f_min, base)
            forecast_block = {
                "dates": f_dates,
                "cumulative": [round(running + v, 1) for v in fc],
                "resolution_m": sources.FORECAST_RESOLUTION_M,
                "note": "Centroid only — the forecast grid is coarser than the region.",
            }
            running = running + fc[-1] if fc else running
        except sources.UpstreamError:
            forecast_block = None

    # ── Projection on the recent rate ────────────────────────────────────
    recent = gdd.daily_increments(mean_series)[-14:]
    projected = gdd.project(running, recent, projection_days)

    ahead_by = None
    if normals_today and mean_series:
        ahead_by = round(mean_series[-1] - normals_today["mean"], 1)

    return {
        "success": True,
        "base_temp_f": base,
        "season_start": start.isoformat(),
        "as_of": today.isoformat(),
        "region": region.describe(),
        "accumulated_gdd": spread,
        "across_region": {
            "note": (
                "min/mean/max are across your region's terrain, not across time. "
                "Spread comes from elevation at ~90 m; the temperature field itself "
                f"resolves ~{sources.HISTORY_RESOLUTION_M // 1000} km."
            ),
            "terrain_correction": "applied" if elevs is not None else "unavailable",
            "archive_cells_fetched": len(cells),
            **({"terrain_note": elev_note} if elev_note else {}),
        },
        "curve": {"dates": dates, "cumulative_mean": mean_series},
        "normals": (
            {
                "span_years": len(normals_curves),
                "band": normals_band,
                "today": normals_today,
                "ahead_of_normal_gdd": ahead_by,
                "note": f"Band is the same calendar window in each of the last {len(normals_curves)} seasons, at the region centroid.",
            }
            if normals_band
            else None
        ),
        "forecast": forecast_block,
        "projection": (
            {
                "days": len(projected),
                "cumulative": projected,
                "note": (
                    "Straight-line carry at the last 14 days' average rate — not a "
                    "forecast. It answers 'if the season keeps behaving as it has', "
                    "which is the question behind a target date. The further out you "
                    "read it, the more it is a sketch."
                ),
            }
            if projected
            else None
        ),
        "sources": [
            {**sources.feed_of(history), "role": "observed daily max/min"},
            {"name": "Open-Meteo forecast", "role": "7-day extension", "resolution_m": sources.FORECAST_RESOLUTION_M},
            {"name": "Open-Meteo elevation (SRTM)", "role": "terrain downscaling", "resolution_m": sources.ELEVATION_RESOLUTION_M},
            {"name": normals_source, "role": "past seasons for the normal band", "resolution_m": normals_resolution},
        ],
    }
