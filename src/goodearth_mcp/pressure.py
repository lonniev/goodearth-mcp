"""The barometer — how fast the pressure is changing, and what that says is coming.

A falling barometer is the oldest storm warning a farm has, and it is still a
good one: the fall is the low arriving, and how FAST it falls says how deep the
low is and how close. The level of the pressure matters less than its tendency
— 1005 hPa and steady is a dull grey day; 1015 hPa and falling 5 hPa in three
hours is weather on its way.

Everything here is pure: hourly sea-level pressure in, a reading out. The
thresholds are named constants with their sources, because a storm signal whose
numbers cannot be checked is a guess dressed as a forecast.

Units are hPa throughout. Open-Meteo reports `pressure_msl` in hPa whatever the
temperature unit, and the page converts to inHg for a grower who reads °F.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any

# ── Tendency classes ────────────────────────────────────────────────────────
# The Met Office shipping-forecast terms for a three-hour pressure change (also
# the WMO code-table 0200 bands): steady under 0.1 hPa, slowly 0.1-1.5,
# unqualified 1.6-3.5, quickly 3.6-6.0, very rapidly beyond 6.0. The bands are
# read as "below the next one's floor" so a 1.55 change is never in no band.
STEADY_BELOW_HPA = 0.1
SLOWLY_BELOW_HPA = 1.6
PLAIN_BELOW_HPA = 3.6
QUICKLY_UP_TO_HPA = 6.0

# ── Storm levels ────────────────────────────────────────────────────────────
#: A fall in three hours that marks the weather as unsettled — the Met Office
#: "falling" band. An ordinary front does this; it is worth a glance, no more.
UNSETTLED_FALL_3H_HPA = 1.6
#: "Falling quickly". The rule of thumb every barometer dial carries — about
#: 0.1 inHg in three hours — and the band where gales are usually forecast.
STORM_FALL_3H_HPA = 3.6
#: A day-long fall that brings a storm even when no three hours of it is fast,
#: provided the pressure has also come down into low territory.
STORM_FALL_24H_HPA = 6.0
STORM_LOW_HPA = 1009.0
#: "Falling very rapidly" — the steepest Met Office band.
SEVERE_FALL_3H_HPA = 6.0
#: Explosive deepening, Sanders & Gyakum (1980): 24 hPa in 24 h at 60°, scaled
#: by sin(latitude)/sin(60°) — about 19 hPa at 42° N.
BOMB_FALL_24H_AT_60_HPA = 24.0

#: How far ahead the signal looks. Beyond about three days a forecast's
#: pressure TENDENCY carries little skill, and a storm signal that cried wolf
#: about next week would be learned to ignore.
HORIZON_H = 72
#: How far back a fall still counts as "now". A front that came through six
#: hours ago is still the weather a grower is standing in.
LOOKBACK_H = 6

LEVELS = ("none", "unsettled", "storm likely", "severe")

NOTE = (
    "Read from the forecast model's hourly sea-level pressure on this ground. "
    "A fast fall is the classic sign of a low arriving; it is a signal, not a "
    "forecast of rain or wind amounts, and a barometer on the porch is the "
    "better instrument for the hour you are in."
)


def _parse(stamp: str) -> datetime | None:
    try:
        return datetime.fromisoformat(stamp[:16])
    except (TypeError, ValueError):
        return None


def series(times: list[Any], values: list[Any]) -> dict[datetime, float]:
    """Hourly readings keyed by their local hour. Gaps and junk are left out."""
    out: dict[datetime, float] = {}
    for t, v in zip(times, values):
        at = _parse(str(t))
        if at is not None and isinstance(v, (int, float)) and math.isfinite(v):
            out[at] = float(v)
    return out


def change(readings: dict[datetime, float], at: datetime, hours: int) -> float | None:
    """Pressure at `at` minus pressure `hours` earlier. Negative is a fall."""
    now, then = readings.get(at), readings.get(at - timedelta(hours=hours))
    if now is None or then is None:
        return None
    return round(now - then, 1)


def tendency(delta_3h: float | None) -> dict[str, Any] | None:
    """A three-hour change in the words a barometer reader uses."""
    if delta_3h is None:
        return None
    size = abs(delta_3h)
    if size < STEADY_BELOW_HPA:
        return {"change_3h_hpa": delta_3h, "direction": "steady", "rate": "", "words": "steady"}
    direction = "rising" if delta_3h > 0 else "falling"
    rate = ("slowly" if size < SLOWLY_BELOW_HPA
            else "" if size < PLAIN_BELOW_HPA
            else "quickly" if size <= QUICKLY_UP_TO_HPA
            else "very rapidly")
    return {
        "change_3h_hpa": delta_3h,
        "direction": direction,
        "rate": rate,
        "words": f"{direction} {rate}".strip(),
    }


def bomb_fall_24h(lat: float) -> float:
    """The 24-hour fall that counts as explosive deepening at this latitude."""
    return round(BOMB_FALL_24H_AT_60_HPA
                 * abs(math.sin(math.radians(lat))) / math.sin(math.radians(60)), 1)


def level_at(fall_3h: float | None, fall_24h: float | None, hpa: float, lat: float) -> int:
    """The storm level one hour reaches, as an index into LEVELS.

    Falls are POSITIVE here — the size of the drop — so the comparisons read
    the way the thresholds are written.
    """
    f3 = fall_3h or 0.0
    f24 = fall_24h or 0.0
    if f3 > SEVERE_FALL_3H_HPA or f24 >= bomb_fall_24h(lat):
        return 3
    if f3 >= STORM_FALL_3H_HPA or (f24 >= STORM_FALL_24H_HPA and hpa < STORM_LOW_HPA):
        return 2
    if f3 >= UNSETTLED_FALL_3H_HPA:
        return 1
    return 0


def storm_signal(
    times: list[Any], values: list[Any], *, now_at: str, lat: float,
) -> dict[str, Any] | None:
    """What the barometer says now, and the storm it implies over the next days.

    `now_at` is this hour on the block's own clock, in the feed's form. Returns
    None when the series cannot place now — no reading at or before it — since
    a storm signal with no present is not one.
    """
    readings = series(times, values)
    now = _parse(now_at)
    if not readings or now is None:
        return None
    present = [t for t in readings if t <= now]
    if not present:
        return None
    here = max(present)
    now_hpa = readings[here]

    worst: tuple[int, float, datetime] | None = None  # (level, fall_3h, at)
    flagged: list[datetime] = []
    for at in sorted(readings):
        if at < here - timedelta(hours=LOOKBACK_H) or at > here + timedelta(hours=HORIZON_H):
            continue
        d3, d24 = change(readings, at, 3), change(readings, at, 24)
        fall3 = -d3 if d3 is not None else None
        fall24 = -d24 if d24 is not None else None
        lvl = level_at(fall3, fall24, readings[at], lat)
        if lvl:
            flagged.append(at)
            key = (lvl, fall3 or 0.0)
            if worst is None or key > (worst[0], worst[1]):
                worst = (lvl, fall3 or 0.0, at)

    d24_now = change(readings, here, 24)
    out: dict[str, Any] = {
        "now_hpa": round(now_hpa, 1),
        "at": here.isoformat(timespec="minutes"),
        "tendency": tendency(change(readings, here, 3)),
        "change_24h_hpa": d24_now,
        "level": LEVELS[worst[0]] if worst else "none",
        "worst": None,
        "window": None,
        "reason": "The barometer shows no fast fall over the next three days.",
        "horizon_h": HORIZON_H,
        "note": NOTE,
    }
    if worst:
        lvl, fall3, at = worst
        fall24 = change(readings, at, 24)
        out["worst"] = {
            "at": at.isoformat(timespec="minutes"),
            "fall_3h_hpa": round(fall3, 1),
            "change_24h_hpa": fall24,
        }
        out["window"] = {
            "from": min(flagged).isoformat(timespec="minutes"),
            "to": max(flagged).isoformat(timespec="minutes"),
        }
        clock = f"{at.hour % 12 or 12} {'AM' if at.hour < 12 else 'PM'}"
        when = "now" if at <= here else f"by {at:%a} {clock}"
        out["reason"] = (
            f"Pressure falls {fall3:.1f} hPa in three hours {when}"
            + (f", {abs(fall24):.1f} hPa over the day" if fall24 is not None and fall24 < 0 else "")
            + "."
        )
    return out


def overlaps(window: dict[str, Any] | None, start: str | None, end: str | None = None) -> bool:
    """Whether a span of local time meets the storm's window.

    Both sides are compared as ISO text, which orders correctly for the feed's
    `YYYY-MM-DDTHH:MM` stamps; a bare date covers its whole day.
    """
    if not window or not start:
        return False
    lo = str(start)
    hi = str(end or start)
    if len(hi) == 10:
        hi += "T23:59"
    return lo <= window["to"] and hi >= window["from"]
