"""Assemble the soil-temperature window — when the ground is ready.

Two sources, two horizons. The forecast reaches about two weeks and is what
tells a grower whether to plant *this* week; the previous seasons' record says
when this crossing normally happens and therefore whether this year is early or
late. Both are reported, because "plant Tuesday" and "you have about three
weeks" answer different questions.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import soil, sources
from goodearth_mcp.region import Region

RECORD_SPAN_YEARS = 8


class SoilWindowError(ValueError):
    """The request cannot be answered as asked."""


async def region_soil_window(
    region: Region,
    threshold_f: float = 60.0,
    direction: str = "cooling",
    band: str = soil.DEFAULT_BAND,
    today: date | None = None,
) -> dict[str, Any]:
    """When soil at ``band`` crosses ``threshold_f``, on this ground."""
    threshold, dirn, band_key = soil.validate(threshold_f, direction, band)
    today = today or datetime.now(UTC).date()
    spec = soil.BANDS[band_key]

    forecast_task = sources.fetch_soil_forecast(
        region.centroid.lat, region.centroid.lon, spec["hourly"], 16
    )
    # One span request for the record, sliced per season locally — same shape
    # as the normals band, and for the same rate-limit reason.
    history_task = sources.fetch_soil_history(
        region.centroid.lat, region.centroid.lon, spec["archive"],
        date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat(),
        date(today.year - 1, 12, 31).isoformat(),
    )
    forecast, history = await asyncio.gather(forecast_task, history_task, return_exceptions=True)

    # ── Near term ────────────────────────────────────────────────────────
    near: dict[str, Any] | None = None
    current_f: float | None = None
    if not isinstance(forecast, BaseException):
        try:
            hours, temps = sources.hourly_series(forecast, spec["hourly"])
            days, means = soil.daily_means(hours, temps)
            current_f = next((m for m in means if m is not None), None)
            # A two-week forecast sits inside one season already, so the
            # seasonal gate would suppress a real crossing here.
            crossing = soil.crossing(days, means, threshold, dirn, seasonal=False)
            near = {
                "days": [{"date": d, "soil_f": m} for d, m in zip(days, means, strict=False)],
                "crossing_date": crossing,
                "note": (
                    "Crossing within the forecast horizon."
                    if crossing else
                    f"The soil does not cross {threshold:.0f} °F within the "
                    f"{len(days)}-day forecast."
                ),
            }
        except sources.UpstreamError:
            near = None

    # ── Typical, from the record ─────────────────────────────────────────
    typical = None
    if not isinstance(history, BaseException):
        try:
            h_dates, h_temps = sources.daily_field(history, spec["archive"])
            by_year: dict[int, tuple[list[str], list[float | None]]] = {}
            for d, t in zip(h_dates, h_temps, strict=False):
                y = int(d[:4])
                bucket = by_year.setdefault(y, ([], []))
                bucket[0].append(d)
                bucket[1].append(t)
            crossings = []
            for y in sorted(by_year):
                c = soil.crossing(by_year[y][0], by_year[y][1], threshold, dirn)
                if c:
                    crossings.append(c)
            typical = soil.typical_crossing(crossings, today.year)
        except (sources.UpstreamError, ValueError):
            typical = None

    if near is None and typical is None:
        raise SoilWindowError(
            "Neither the soil forecast nor the soil record could be read for this ground."
        )

    days_out = None
    if typical:
        days_out = (date.fromisoformat(typical["median"]) - today).days

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "band": {"key": band_key, "label": spec["label"]},
        "threshold_f": threshold,
        "direction": dirn,
        "current_soil_f": current_f,
        "near_term": near,
        "typical": typical,
        "days_to_typical_crossing": days_out,
        "note": (
            f"Soil {dirn} through {threshold:.0f} °F at {spec['label']}. Soil lags "
            "air by weeks and is the steadier signal — it is what decides whether "
            "a clove or a seed should go in, not one warm afternoon."
        ),
        "sources": [
            {"name": "Open-Meteo forecast", "role": f"hourly soil at {spec['label']}",
             "resolution_m": sources.FORECAST_RESOLUTION_M},
            {**sources.feed_of(history), "role": f"{RECORD_SPAN_YEARS}-season soil record"},
        ],
    }
