"""The almanac — the sky's own record, beside the crop's.

Degree days answer what the season is doing to the plants. This answers what
the season is doing, full stop: how warm, how humid, how wet, how much sun,
and where the sun and moon are in their own cycles.

Growers read these together. A week of high dew points is disease weather
whatever the degree-day total says; a dry August is a decision about irrigating
that heat accumulation cannot make for you; and the day length is what tells a
short-day variety to set bud regardless of how warm it has been.

Three horizons for every measure, because that is how the question is actually
asked — "is this normal, what has it been, what is coming":

* the **normal** from previous seasons,
* the **actual** so far this year,
* the **forecast** ahead.

Sun and moon are astronomy, not meteorology: computed exactly, never fetched,
and never uncertain.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

# WMO 4677 present-weather codes, as Open-Meteo reports them. Grouped the way
# a grower reads a sky rather than the way a meteorologist codes one.
WMO: dict[int, tuple[str, str]] = {
    0: ("Clear", "☀️"),
    1: ("Mainly clear", "🌤️"), 2: ("Partly cloudy", "⛅"), 3: ("Overcast", "☁️"),
    45: ("Fog", "🌫️"), 48: ("Rime fog", "🌫️"),
    51: ("Light drizzle", "🌦️"), 53: ("Drizzle", "🌦️"), 55: ("Heavy drizzle", "🌧️"),
    56: ("Freezing drizzle", "🧊"), 57: ("Freezing drizzle", "🧊"),
    61: ("Light rain", "🌦️"), 63: ("Rain", "🌧️"), 65: ("Heavy rain", "🌧️"),
    66: ("Freezing rain", "🧊"), 67: ("Freezing rain", "🧊"),
    71: ("Light snow", "🌨️"), 73: ("Snow", "🌨️"), 75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "🌨️"),
    80: ("Showers", "🌦️"), 81: ("Showers", "🌧️"), 82: ("Violent showers", "⛈️"),
    85: ("Snow showers", "🌨️"), 86: ("Snow showers", "❄️"),
    95: ("Thunderstorm", "⛈️"), 96: ("Thunderstorm with hail", "⛈️"),
    99: ("Thunderstorm with hail", "⛈️"),
}


def describe_code(code: Any) -> dict[str, str]:
    """A WMO code as words and a glyph a grower can read at a glance."""
    try:
        label, emoji = WMO[int(code)]
    except (TypeError, ValueError, KeyError):
        return {"label": "Unknown", "emoji": "•"}
    return {"label": label, "emoji": emoji}


COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def describe_wind(speed_mph: float | None, direction_deg: float | None) -> dict[str, Any]:
    """Wind as a grower states it: where it is FROM, and how hard.

    Meteorological convention — a "south wind" blows from the south — because
    that is what the person standing in the field means. The arrow points the
    way the air is travelling, which is the opposite, so it is rotated 180°.
    """
    point = None
    arrow = None
    if direction_deg is not None:
        idx = int((float(direction_deg) / 22.5) + 0.5) % 16
        point = COMPASS[idx]
        arrows = ["↓", "↙", "↙", "←", "←", "↖", "↖", "↑",
                  "↑", "↗", "↗", "→", "→", "↘", "↘", "↓"]
        arrow = arrows[idx]

    if speed_mph is None:
        return {"from": point, "arrow": arrow, "emoji": "🌬️", "strength": None}

    s = float(speed_mph)
    # Beaufort, collapsed to the distinctions that change a decision: whether
    # you can spray, whether row cover stays put, whether frost can pool.
    if s < 4:
        strength, emoji = "calm", "🍃"
    elif s < 13:
        strength, emoji = "light", "🍃"
    elif s < 25:
        strength, emoji = "breezy", "🌬️"
    elif s < 39:
        strength, emoji = "windy", "💨"
    else:
        strength, emoji = "gale", "🌪️"
    return {"from": point, "arrow": arrow, "emoji": emoji, "strength": strength,
            "speed_mph": round(s, 1)}


# ── Sun ──────────────────────────────────────────────────────────────────


def hours(seconds: float | None) -> float | None:
    return round(seconds / 3600.0, 2) if isinstance(seconds, (int, float)) else None


def sunshine_fraction(sunshine_s: float | None, daylight_s: float | None) -> float | None:
    """How much of the available daylight actually arrived as sun.

    More useful than either number alone: eight hours of sun in June is a dull
    day and in December is a brilliant one.
    """
    if not isinstance(sunshine_s, (int, float)) or not isinstance(daylight_s, (int, float)):
        return None
    if daylight_s <= 0:
        return None
    return round(min(sunshine_s / daylight_s, 1.0), 3)


# ── Moon ─────────────────────────────────────────────────────────────────

# A synodic month — new moon to new moon.
SYNODIC = 29.530588853
# A known new moon, 2000-01-06 18:14 UTC, as a Julian day.
NEW_MOON_EPOCH = 2451550.26

PHASES = [
    (0.02, "New moon", "🌑"),
    (0.24, "Waxing crescent", "🌒"),
    (0.27, "First quarter", "🌓"),
    (0.48, "Waxing gibbous", "🌔"),
    (0.52, "Full moon", "🌕"),
    (0.74, "Waning gibbous", "🌖"),
    (0.77, "Last quarter", "🌗"),
    (0.98, "Waning crescent", "🌘"),
    (1.01, "New moon", "🌑"),
]


def julian_day(d: date) -> float:
    """Julian day at noon UTC on ``d``."""
    y, m = d.year, d.month
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return (
        math.floor(365.25 * (y + 4716))
        + math.floor(30.6001 * (m + 1))
        + d.day + b - 1524.5 + 0.5
    )


def moon_phase(d: date) -> dict[str, Any]:
    """Moon phase for a date — astronomy, so it is computed, never fetched.

    Returns the fraction through the cycle (0 and 1 are new, 0.5 is full),
    the illuminated fraction, and the name and glyph a reader expects.
    """
    age = ((julian_day(d) - NEW_MOON_EPOCH) % SYNODIC) / SYNODIC
    if age < 0:
        age += 1.0
    illumination = (1 - math.cos(2 * math.pi * age)) / 2
    name, emoji = next((n, e) for cut, n, e in PHASES if age <= cut)
    return {
        "date": d.isoformat(),
        "phase": round(age, 3),
        "illumination": round(illumination, 3),
        "name": name,
        "emoji": emoji,
        "age_days": round(age * SYNODIC, 1),
    }


def next_full_moon(after: date, within_days: int = 40) -> str | None:
    """The next full moon on or after ``after``.

    Worth surfacing because a clear night near full moon is also a still,
    radiating night — the frost nights growers remember.
    """
    for i in range(within_days):
        d = after + timedelta(days=i)
        if moon_phase(d)["name"] == "Full moon":
            return d.isoformat()
    return None


# ── Daily aggregation ────────────────────────────────────────────────────


def day_length_change(daylight_hours: list[float | None]) -> float | None:
    """Minutes of daylight gained or lost per day, from the recent trend.

    Photoperiod is what tells a short-day variety to set bud, and the RATE is
    what a grower feels — three minutes a day in September is the sky closing
    fast.

    Takes HOURS (the caller has already converted from the feed's seconds), so
    the conversion to minutes multiplies. Dividing instead — which is what this
    did first — returned -0.0 for a late-August day losing nearly three minutes
    a day, a number that looks like "no change" rather than like a bug.
    """
    clean = [h for h in daylight_hours if isinstance(h, (int, float))]
    if len(clean) < 2:
        return None
    span = min(7, len(clean) - 1)
    return round(((clean[-1] - clean[-1 - span]) / span) * 60.0, 2)


def normal_band(series_by_year: list[list[float | None]]) -> list[dict[str, float]] | None:
    """Per-day min/mean/max across seasons, skipping gaps."""
    if not series_by_year:
        return None
    n = min(len(s) for s in series_by_year)
    if n == 0:
        return None
    out: list[dict[str, float]] = []
    for i in range(n):
        vals = [s[i] for s in series_by_year if isinstance(s[i], (int, float))]
        if not vals:
            out.append({"min": 0.0, "mean": 0.0, "max": 0.0})
            continue
        out.append({
            "min": round(min(vals), 2),
            "mean": round(sum(vals) / len(vals), 2),
            "max": round(max(vals), 2),
        })
    return out


def running_total(values: list[float | None]) -> list[float]:
    """Cumulative sum that carries a gap forward flat rather than dipping."""
    total = 0.0
    out: list[float] = []
    for v in values:
        if isinstance(v, (int, float)):
            total += v
        out.append(round(total, 2))
    return out


def day_length_hours(lat: float, d: date) -> float:
    """Day length at a latitude, computed rather than fetched.

    Sunrise-to-sunset from the solar declination and the hour angle, including
    the standard −0.833° correction for refraction and the sun's disc, which is
    what "sunrise" conventionally means.

    This exists so a photoperiod event can be answered for a date the archive
    has not reached. Day length is astronomy: it is exactly as knowable next
    March as it is today, and reporting "unknown" for a future crossing would
    be a limitation of the plumbing rather than of the knowledge.
    """
    n = d.timetuple().tm_yday
    # Solar declination, Cooper's approximation — well within a minute of day
    # length for this purpose.
    decl = 23.45 * math.sin(math.radians(360.0 * (284 + n) / 365.0))
    phi = math.radians(lat)
    delta = math.radians(decl)
    cos_h = (math.sin(math.radians(-0.833)) - math.sin(phi) * math.sin(delta)) / (
        math.cos(phi) * math.cos(delta)
    )
    if cos_h >= 1:
        return 0.0      # polar night
    if cos_h <= -1:
        return 24.0     # midnight sun
    return round(2 * math.degrees(math.acos(cos_h)) / 15.0, 3)


def next_daylight_crossing(
    lat: float,
    after: date,
    hours_wanted: float,
    rising: bool,
    within_days: int = 400,
) -> str | None:
    """The next date day length crosses a threshold in the given direction.

    Searches forward a little over a year so an event already past this season
    still returns its date next season rather than nothing.
    """
    prev = day_length_hours(lat, after)
    for i in range(1, within_days + 1):
        d = after + timedelta(days=i)
        h = day_length_hours(lat, d)
        up = h > prev
        if up == rising and ((prev < hours_wanted <= h) or (prev > hours_wanted >= h)):
            return d.isoformat()
        prev = h
    return None
