"""Assemble the almanac — normal, actual and forecast for every measure.

One call covers the season's weather the way a grower reads it: each measure
against what is normal here, what has actually happened, and what is coming.

Three upstream requests regardless of how many measures are asked for — the
season's actuals, one multi-year span for the normals, and the forecast.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from typing import Any

from goodearth_mcp import almanac, gdd, sources
from goodearth_mcp.region import Region

NORMALS_SPAN_YEARS = 10
FORECAST_DAYS = 14

# The measures the almanac carries, and how each is read. `accumulate` marks
# the ones that only mean something as a running total — an inch of rain on
# one day says little; eleven inches since April says whether the season is dry.
MEASURES = {
    "temp_max":   {"field": "temperature_2m_max",   "unit": "°F",   "accumulate": False},
    "temp_min":   {"field": "temperature_2m_min",   "unit": "°F",   "accumulate": False},
    "dew_point":  {"field": "dew_point_2m_mean",    "unit": "°F",   "accumulate": False},
    "precip":     {"field": "precipitation_sum",    "unit": "in",   "accumulate": True},
    "sunshine":   {"field": "sunshine_duration",    "unit": "hours", "accumulate": False},
    "daylight":   {"field": "daylight_duration",    "unit": "hours", "accumulate": False},
    "wind_max":   {"field": "wind_speed_10m_max",   "unit": "mph",  "accumulate": False},
}
SECONDS_FIELDS = {"sunshine_duration", "daylight_duration"}


class AlmanacError(ValueError):
    """The request cannot be answered as asked."""


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, (int, float)) else None


def _series(block: dict[str, list[Any]], field: str) -> list[float | None]:
    raw = block.get(field) or []
    vals = [_num(v) for v in raw]
    if field in SECONDS_FIELDS:
        return [almanac.hours(v) if v is not None else None for v in vals]
    return vals


async def region_almanac(
    region: Region,
    today: date | None = None,
) -> dict[str, Any]:
    """The sky's record for this ground: normal, actual, and what is coming."""
    today = today or datetime.now(UTC).date()
    start = gdd.season_start(today)

    actual_task = sources.fetch_almanac_history(
        region.centroid.lat, region.centroid.lon,
        start.isoformat(), today.isoformat(),
    )
    normals_task = sources.fetch_almanac_history(
        region.centroid.lat, region.centroid.lon,
        date(today.year - NORMALS_SPAN_YEARS, 1, 1).isoformat(),
        date(today.year - 1, 12, 31).isoformat(),
    )
    forecast_task = sources.fetch_almanac_forecast(
        region.centroid.lat, region.centroid.lon, FORECAST_DAYS
    )

    actual, normals, forecast = await asyncio.gather(
        actual_task, normals_task, forecast_task, return_exceptions=True
    )

    if isinstance(actual, BaseException):
        raise AlmanacError(f"could not read this season's record: {actual}")

    a_block = sources.daily_block(actual)
    a_dates = [str(d) for d in (a_block.get("time") or [])]
    if not a_dates:
        raise AlmanacError("the archive returned no days for this region")

    # ── Normals, sliced per season from one span ─────────────────────────
    n_by_field: dict[str, list[dict[str, float]] | None] = {}
    if not isinstance(normals, BaseException):
        n_block = sources.daily_block(normals)
        n_dates = [str(d) for d in (n_block.get("time") or [])]
        index: dict[int, list[int]] = {}
        for i, d in enumerate(n_dates):
            index.setdefault(int(d[:4]), []).append(i)
        for key, spec in MEASURES.items():
            full = _series(n_block, spec["field"])
            per_year: list[list[float | None]] = []
            for y in sorted(index):
                idxs = index[y]
                # Align each season to the same calendar window as the actuals.
                aligned: list[float | None] = []
                for offset in range(len(a_dates)):
                    day = start + timedelta(days=offset)
                    try:
                        want = day.replace(year=y).isoformat()
                    except ValueError:
                        aligned.append(None)
                        continue
                    pos = next((i for i in idxs if n_dates[i] == want), None)
                    aligned.append(full[pos] if pos is not None else None)
                if any(v is not None for v in aligned):
                    per_year.append(aligned)
            n_by_field[key] = almanac.normal_band(per_year)
    else:
        n_by_field = {k: None for k in MEASURES}

    # ── Forecast ─────────────────────────────────────────────────────────
    f_block: dict[str, list[Any]] = {}
    f_dates: list[str] = []
    if not isinstance(forecast, BaseException):
        f_block = sources.daily_block(forecast)
        f_dates = [str(d) for d in (f_block.get("time") or [])]

    measures: dict[str, Any] = {}
    for key, spec in MEASURES.items():
        act = _series(a_block, spec["field"])
        fc = _series(f_block, spec["field"]) if f_block else []
        band = n_by_field.get(key)
        entry: dict[str, Any] = {
            "unit": spec["unit"],
            "actual": act,
            "forecast": fc,
            "normal": band,
            "accumulates": spec["accumulate"],
        }
        if spec["accumulate"]:
            entry["actual_total"] = almanac.running_total(act)[-1] if act else 0.0
            if band:
                entry["normal_total"] = round(sum(b["mean"] for b in band), 2)
        else:
            clean = [v for v in act if v is not None]
            entry["latest"] = clean[-1] if clean else None
            if band:
                entry["normal_today"] = band[min(len(clean), len(band)) - 1] if clean and band else None
        measures[key] = entry

    # ── Today, in the terms a grower reads a sky ─────────────────────────
    conditions = None
    if f_dates:
        code = (f_block.get("weather_code") or [None])[0]
        conditions = {
            "date": f_dates[0],
            "sky": almanac.describe_code(code),
            "wind": almanac.describe_wind(
                _num((f_block.get("wind_speed_10m_max") or [None])[0]),
                _num((f_block.get("wind_direction_10m_dominant") or [None])[0]),
            ),
            "high_f": _num((f_block.get("temperature_2m_max") or [None])[0]),
            "low_f": _num((f_block.get("temperature_2m_min") or [None])[0]),
            "dew_point_f": _num((f_block.get("dew_point_2m_mean") or [None])[0]),
            "precip_chance_pct": _num((f_block.get("precipitation_probability_max") or [None])[0]),
            "sunrise": (f_block.get("sunrise") or [None])[0],
            "sunset": (f_block.get("sunset") or [None])[0],
            "daylight_hours": almanac.hours(_num((f_block.get("daylight_duration") or [None])[0])),
            "sunshine_hours": almanac.hours(_num((f_block.get("sunshine_duration") or [None])[0])),
            "sunshine_fraction": almanac.sunshine_fraction(
                _num((f_block.get("sunshine_duration") or [None])[0]),
                _num((f_block.get("daylight_duration") or [None])[0]),
            ),
        }

    # Days, not degrees: the sky closing in September is something a grower
    # feels before any thermometer says so.
    daylight_trend = almanac.day_length_change(_series(a_block, "daylight_duration"))

    def at(field: str, i: int) -> float | None:
        """One day's value, or None past the end of a short series."""
        seq = f_block.get(field) or []
        return _num(seq[i]) if i < len(seq) else None

    upcoming = []
    for i, d in enumerate(f_dates):
        codes = f_block.get("weather_code") or []
        upcoming.append({
            "date": d,
            "sky": almanac.describe_code(codes[i] if i < len(codes) else None),
            "high_f": at("temperature_2m_max", i),
            "low_f": at("temperature_2m_min", i),
            "dew_point_f": at("dew_point_2m_mean", i),
            "precip_in": at("precipitation_sum", i),
            "precip_chance_pct": at("precipitation_probability_max", i),
            "sunshine_hours": almanac.hours(at("sunshine_duration", i)),
            "wind": almanac.describe_wind(
                at("wind_speed_10m_max", i),
                at("wind_direction_10m_dominant", i),
            ),
        })

    return {
        "success": True,
        "as_of": today.isoformat(),
        "season_start": start.isoformat(),
        "region": region.describe(),
        "dates": a_dates,
        "forecast_dates": f_dates,
        "measures": measures,
        "conditions": conditions,
        "upcoming": upcoming,
        "sun": {
            "daylight_change_min_per_day": daylight_trend,
            "note": (
                "Day length is astronomy — exact, and the same every year. It is "
                "what tells a short-day variety to set bud however warm it has been."
            ),
        },
        "moon": {
            **almanac.moon_phase(today),
            "next_full": almanac.next_full_moon(today),
            "note": (
                "A clear night near full moon is also a still, radiating night — "
                "which is the kind that takes a crop."
            ),
        },
        "normals_span_years": NORMALS_SPAN_YEARS,
        "sources": [
            {**sources.feed_of(actual), "role": "season actuals and normals"},
            {"name": "Open-Meteo forecast", "role": "14-day outlook, sun times",
             "resolution_m": sources.FORECAST_RESOLUTION_M},
            {"name": "computed", "role": "moon phase, day-length trend", "resolution_m": 0},
        ],
    }
