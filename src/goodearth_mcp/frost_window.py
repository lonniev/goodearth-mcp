"""Assemble the region frost window — the answer T2 sells.

Composes the region grid, the archive record, and the nightly forecast into
one answer: when frost normally arrives on this ground, how much the region's
own terrain spreads that, and whether any night this week is going to take a
crop.

The terrain spread is the point. A forecast low is a grid-cell average; on the
still, clear nights when frost actually forms, cold air drains off the bench
and pools in the hollow, so one number cannot be right for both. This module
reports the coldest ground explicitly, and says which night and why.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from typing import Any

from goodearth_mcp import frost, gdd, record_cache, sources
from goodearth_mcp.region import Region, summarize

RECORD_SPAN_YEARS = 10
FORECAST_NIGHTS = 10


class FrostError(ValueError):
    """A caller's request cannot be answered as asked."""


async def _season_so_far(
    region: Region, begin: date, today: date, record_frosts: list[str], start: tuple[int, int],
) -> dict[str, Any] | None:
    """This season from its first day to yesterday, read apart from the record."""
    yesterday = today - timedelta(days=1)
    if yesterday < begin:
        return None
    try:
        season = await record_cache.daily_history(
            [region.centroid.lat], [region.centroid.lon], begin.isoformat(), yesterday.isoformat()
        )
    except sources.UpstreamError:
        return None
    if not season:
        return None
    dates, _tmax, tmin = sources.daily_series(season[0])
    return frost.season_so_far(dates, tmin, record_frosts, today, start)


async def region_frost_window(
    region: Region,
    today: date | None = None,
) -> dict[str, Any]:
    """First-frost climatology plus this week's risk, across a region."""
    today = today or datetime.now(UTC).date()

    try:
        elevs = await record_cache.elevations(
            [p.lat for p in region.points], [p.lon for p in region.points]
        )
        elev_note = None
    except sources.UpstreamError as exc:
        elevs, elev_note = None, str(exc)

    record_task = record_cache.daily_history(
        [region.centroid.lat],
        [region.centroid.lon],
        date(sources.record_start_year(today.year, RECORD_SPAN_YEARS), 1, 1).isoformat(),
        # Through last December, the span Daymet covers. Reaching into this
        # year pushed the whole record onto the coarse reanalysis, whose
        # smoothed night lows dated every first frost weeks late.
        date(today.year - 1, 12, 31).isoformat(),
    )
    forecast_task = sources.fetch_frost_forecast(
        region.centroid.lat, region.centroid.lon, FORECAST_NIGHTS
    )

    record, forecast = await asyncio.gather(record_task, forecast_task, return_exceptions=True)

    # ── Climatology ──────────────────────────────────────────────────────
    # The season begins where this ground's own record says frost never
    # comes, so the projection turns to the next season on that day: mid-July
    # in Vermont and on the Gulf Coast, mid-January south of the equator.
    history: dict[str, Any] | None = None
    so_far: dict[str, Any] | None = None
    if not isinstance(record, BaseException) and record:
        try:
            dates, _tmax, tmin = sources.daily_series(record[0])
            start = frost.season_start(dates, tmin)
            if start is not None:
                begin = frost.season_of(today, start)
                years = list(range(sources.record_start_year(today.year, RECORD_SPAN_YEARS), begin.year))
                record_frosts = frost.frost_dates(dates, tmin, years, start)
                history = frost.summarize_frost_dates(record_frosts, begin.year)
                if history is not None:
                    history["season_starts"] = begin.isoformat()
                so_far = await _season_so_far(region, begin, today, record_frosts, start)
        except (sources.UpstreamError, IndexError, ValueError):
            history, so_far = None, None

    # ── Terrain spread ───────────────────────────────────────────────────
    # How much colder the coldest ground runs than the region's mean on a
    # radiative night. Reuses the same drainage model the season curve uses,
    # so the two answers cannot disagree about the same field.
    drainage_f = 0.0
    elevation_range_m = None
    if elevs:
        high, low = max(elevs), min(elevs)
        elevation_range_m = round(high - low, 1)
        # Take the pooling term DIRECTLY rather than differencing two
        # downscale() results. Doing it through downscale lets the standard
        # lapse rate cancel most of the drainage — and on a frost night that is
        # backwards physics: a calm, clear night INVERTS the profile, so the
        # hollow is colder than the bench rather than warmer. The inversion is
        # what the drainage term models; the daytime lapse rate has no business
        # opposing it here. (Differencing gave 0.8 °F across 99 m of relief
        # where the pooling model alone gives 2.0 °F.)
        drainage_f = min(
            (high - low) * gdd.DRAINAGE_F_PER_M, gdd.MAX_DRAINAGE_F
        )

    # ── This week ────────────────────────────────────────────────────────
    nights: list[dict[str, Any]] = []
    if not isinstance(forecast, BaseException):
        try:
            for n in sources.frost_series(forecast):
                assessed = frost.night_risk(
                    n["low_f"], drainage_f, n["wind_mph"], n["cloud_pct"]
                )
                assessed["date"] = n["date"]
                assessed["dew_point_f"] = n["dew_point_f"]
                assessed["high_f"] = n["high_f"]
                nights.append(assessed)
        except sources.UpstreamError:
            nights = []

    if history is None and not nights:
        raise FrostError(
            "Neither the frost record nor the forecast could be read for this ground."
        )

    worst = frost.worst(nights)
    days_to_median = None
    if history:
        days_to_median = (date.fromisoformat(history["median"]) - today).days

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "first_frost": history,
        "days_to_median_first_frost": days_to_median,
        "this_season": so_far,
        "across_region": {
            "coldest_ground_offset_f": round(drainage_f, 1),
            "elevation_range_m": elevation_range_m,
            "terrain_correction": "applied" if elevs else "unavailable",
            **({"terrain_note": elev_note} if elev_note else {}),
            "note": (
                "The coldest ground runs this much below the forecast low on a "
                "calm, clear night — less when wind or cloud mixes the air. "
                "Frost is a terrain process, so one number cannot serve a bench "
                "and a hollow on the same block. This is a conservative "
                "first-principles estimate from relief alone; a farm's real "
                "inversion depends on its shape and its outlet, which is what "
                "field reports calibrate."
            ),
        },
        "nights": nights,
        "worst_night": worst,
        "thresholds_f": {
            "frost": frost.FROST_F,
            "watch": frost.FROST_WATCH_F,
            "hard_freeze": frost.HARD_FREEZE_F,
        },
        "sources": [
            {
                **sources.feed_of(record),
                # The span actually read, not the one asked for. The feed
                # starts in 2018, so a ten-season request is honoured with
                # however many exist — and saying "10 seasons" over eight of
                # them would be a claim about evidence we do not have.
                "role": (
                    f"first-frost dates, "
                    f"{today.year - sources.record_start_year(today.year, RECORD_SPAN_YEARS)} seasons"
                ),
            },
            {
                "name": "Open-Meteo forecast",
                "role": "nightly low, wind and cloud",
                "resolution_m": sources.FORECAST_RESOLUTION_M,
            },
            {
                "name": "Open-Meteo elevation (SRTM)",
                "role": "cold-air drainage",
                "resolution_m": sources.ELEVATION_RESOLUTION_M,
            },
        ],
    }


__all__ = ["FrostError", "region_frost_window", "summarize"]
