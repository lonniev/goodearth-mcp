"""Drying — when the dew burns off this ground, and the dry days ahead.

The hours the disease models read, turned the other way round. An hour is the
leaf estimated wet by `wetness.Hour.wet`; a dry day is one with no hour of rain.
What a grower does with a dry morning — cut flowers, pick, mow, rake hay — is
theirs. This reports conditions, and never says a crop is ready.

NOT WET IS NOT DRYING. A still, overcast, humid afternoon wets nothing and dries
almost nothing, so every day also carries its reference evapotranspiration
(FAO-56 ET0, mm) — the evaporative demand of the air, the standard measure of how
hard a day pulls water out of anything wet — and its peak vapour-pressure
deficit. The strongest drying day in a run is the one with the most ET0, stated
as a fact about the weather rather than as a threshold anyone should cut by.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from goodearth_mcp import wetness

#: The dew is "off" once the leaf has stayed dry this many hours running. One dry
#: hour between two humid ones is a lull, not a morning.
DEW_OFF_HOLD_H = 2

#: Mornings only. A leaf still wet at 2 pm is wet from weather, not dew, and "the
#: dew burns off at 5 pm" is not a sentence anyone can act on.
MORNING_LAST_HOUR = 14

NOTE = (
    "Drying is read from the same modelled hours as leaf wetness — estimated, never "
    "measured. It says when this ground's leaves are estimated to stay dry and which "
    "forecast days bring no rain. Whether a crop is ready to cut, or hay will cure, "
    "depends on the crop, the swath and the field as much as on the air, and is the "
    "grower's call."
)


@dataclass(frozen=True)
class DryHour:
    """One hour: the wetness verdicts, and what decides how fast things dry."""

    hour: wetness.Hour
    et0_mm: float | None
    vpd_kpa: float | None
    wind_mph: float | None
    sun_wm2: float | None


def read_hours(block: dict[str, Any]) -> list[DryHour]:
    """The wetness hours of an Open-Meteo block, with the drying fields beside them."""
    base = wetness.read_hours(block)

    def col(name: str) -> list[float | None]:
        return [float(v) if isinstance(v, (int, float)) else None
                for v in (block.get(name) or [])]

    et0, vpd = col("et0_fao_evapotranspiration"), col("vapour_pressure_deficit")
    wind, sun = col("wind_speed_10m"), col("shortwave_radiation")

    def at(c: list[float | None], i: int) -> float | None:
        return c[i] if i < len(c) else None

    return [DryHour(h, at(et0, i), at(vpd, i), at(wind, i), at(sun, i))
            for i, h in enumerate(base)]


def _hh(stamp: str) -> int:
    return int(stamp[11:13])


def dew_off(hours: list[DryHour], day: str) -> dict[str, Any]:
    """When the morning's wetness clears on `day`.

    ``{"state": "dry"}`` — no wet hour this morning. ``{"state": "clears", "at"}``
    — the first hour after the morning's last wet hour, provided the leaf then
    stays dry for DEW_OFF_HOLD_H hours. ``{"state": "wet"}`` — still wet at the
    end of the morning. ``{"state": "unknown"}`` — the feed said nothing.
    """
    today = [d for d in hours if d.hour.day == day]
    morning = [d for d in today if _hh(d.hour.at) <= MORNING_LAST_HOUR]
    if not any(d.hour.known for d in morning):
        return {"state": "unknown", "at": None}
    wet_at = [i for i, d in enumerate(morning) if d.hour.wet]
    if not wet_at:
        return {"state": "dry", "at": None}
    last = wet_at[-1]
    after = today[last + 1:last + 1 + DEW_OFF_HOLD_H]
    if last == len(morning) - 1 or len(after) < DEW_OFF_HOLD_H \
            or any(d.hour.wet or not d.hour.known for d in after):
        return {"state": "wet", "at": None}
    return {"state": "clears", "at": after[0].hour.at}


def summarize(hours: list[DryHour]) -> list[dict[str, Any]]:
    """One row per local day: rain, wet hours, and the day's drying power."""
    days: dict[str, list[DryHour]] = {}
    for d in hours:
        days.setdefault(d.hour.day, []).append(d)

    out = []
    for day, hs in days.items():
        known = [d for d in hs if d.hour.known]
        rain_hours = sum(1 for d in hs if d.hour.rained)
        et0 = [d.et0_mm for d in hs if d.et0_mm is not None]
        vpd = [d.vpd_kpa for d in hs if d.vpd_kpa is not None]
        out.append({
            "date": day,
            # A day the feed did not fill is not a dry day.
            "dry": (rain_hours == 0) if known else None,
            "rain_mm": round(sum(d.hour.precip_mm or 0.0 for d in hs), 1),
            "rain_hours": rain_hours,
            "wet_hours": sum(1 for d in hs if d.hour.wet),
            "et0_mm": round(sum(et0), 2) if et0 else None,
            "vpd_max_kpa": round(max(vpd), 2) if vpd else None,
        })
    return out


def dry_run(days: list[dict[str, Any]], from_day: str) -> dict[str, Any] | None:
    """The first unbroken run of dry days on or after `from_day`."""
    run: list[dict[str, Any]] = []
    for d in days:
        if d["date"] < from_day:
            continue
        if d["dry"]:
            run.append(d)
        elif run:
            break
    if not run:
        return None
    strongest = max(run, key=lambda d: d["et0_mm"] or 0.0)
    return {
        "start": run[0]["date"],
        "end": run[-1]["date"],
        "days": len(run),
        "strongest": strongest["date"] if strongest["et0_mm"] is not None else None,
    }


def next_rain(hours: list[DryHour], after: str) -> dict[str, Any] | None:
    """The first hour of rain later than `after`."""
    for d in hours:
        if d.hour.at > after and d.hour.rained:
            return {"at": d.hour.at, "mm": round(d.hour.precip_mm or 0.0, 1)}
    return None


def assess(hours: list[DryHour], *, today: str, now_at: str) -> dict[str, Any]:
    """Today's and tomorrow's mornings, the dry days ahead, and the next rain."""
    tomorrow = (date.fromisoformat(today) + timedelta(days=1)).isoformat()
    days = summarize(hours)
    return {
        "now": now_at,
        "today": {"date": today, "dew_off": dew_off(hours, today)},
        "tomorrow": {"date": tomorrow, "dew_off": dew_off(hours, tomorrow)},
        "dry_run": dry_run(days, today),
        "next_rain": next_rain(hours, now_at),
        "days": days,
    }
