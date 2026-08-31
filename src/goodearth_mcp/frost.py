"""Frost — the question that ends a season.

Two different questions wear the same word, and a grower needs both:

* **When does frost normally arrive?** A climatological answer, from the
  record. It decides what gets planted in July and whether a succession has
  time to finish.
* **Is it going to frost this week?** A forecast answer. It decides whether
  anyone is out at dusk with row cover.

The second is where region scope earns its keep. Radiative frost — the clear,
calm, dry night kind — is a *terrain* phenomenon: cold air drains downhill and
pools, so a hollow can take frost while the bench two hundred metres uphill
does not. A single forecast low for a farm answers neither bed correctly.

Pure domain logic: no billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

# Frost forms at the plant well before the thermometer in the shelter reads
# 32 °F, because the shelter sits 1.5 m up and the coldest air is at the
# canopy. 36 °F at screen height is the conventional watch threshold.
FROST_F = 32.0
FROST_WATCH_F = 36.0
HARD_FREEZE_F = 28.0

# A frost date only means something in the back half of the season; a cold
# snap in May is a late spring frost, a different question entirely.
FALL_SEARCH_START = (7, 15)  # Jul 15

# A spring frost only counts before midsummer. A freak cold night in August is
# an early FALL frost, and calling it a late spring one would tell a grower the
# planting season had not started yet.
SPRING_SEARCH_END = (6, 30)  # Jun 30


def first_fall_frost(dates: list[str], tmin: list[float | None], year: int) -> str | None:
    """The first date on or after Jul 15 of ``year`` with a min at or below freezing."""
    cutoff = date(year, *FALL_SEARCH_START)
    for d, lo in zip(dates, tmin, strict=False):
        if lo is None:
            continue
        try:
            day = date.fromisoformat(d)
        except ValueError:
            continue
        if day.year == year and day >= cutoff and lo <= FROST_F:
            return d
    return None


def _month_day(iso: str) -> tuple[int, int]:
    """Sort key for a frost date: (month, day).

    Deliberately NOT day-of-year. A leap year shifts every autumn date's
    day-of-year by one, so a median taken across leap and common years lands a
    day off the calendar date growers actually think in — Oct 6 in a leap year
    and Oct 6 in a common year are the same date to a farmer and must compare
    equal here. Feb 29 never appears in a fall-frost record, so (month, day)
    is total for this purpose.
    """
    d = date.fromisoformat(iso)
    return (d.month, d.day)


def frost_dates(dates: list[str], tmin: list[float | None], years: list[int]) -> list[str]:
    """First fall frost for each year that has one on record."""
    out = []
    for y in years:
        d = first_fall_frost(dates, tmin, y)
        if d:
            out.append(d)
    return out


def summarize_frost_dates(iso_dates: list[str], reference_year: int) -> dict[str, Any] | None:
    """Median and earliest first-frost, expressed in the reference year.

    Dates are compared by day-of-year so seasons line up, then re-expressed
    against ``reference_year`` — a grower planning this August does not care
    that the median fell in 2019.
    """
    if not iso_dates:
        return None
    keys = sorted(_month_day(d) for d in iso_dates)
    n = len(keys)

    if n % 2:
        median_key = keys[n // 2]
    else:
        # Even count: take the midpoint between the two central dates by day
        # offset within the reference year, so the answer can fall between
        # them rather than arbitrarily picking one.
        lo = date(reference_year, *keys[n // 2 - 1])
        hi = date(reference_year, *keys[n // 2])
        mid = lo + timedelta(days=(hi - lo).days // 2)
        median_key = (mid.month, mid.day)

    def to_date(key: tuple[int, int]) -> str:
        return date(reference_year, key[0], key[1]).isoformat()

    return {
        "median": to_date(median_key),
        "earliest": to_date(keys[0]),
        "latest": to_date(keys[-1]),
        "years_on_record": n,
        "note": (
            f"First fall frost (min at or below {FROST_F:.0f} °F) in each of the "
            f"last {n} seasons on record, at the region centroid."
        ),
    }


def radiative_risk(wind_mph: float | None, cloud_pct: float | None) -> tuple[float, str]:
    """How much colder than forecast a low spot may run tonight, and why.

    Frost is a radiative process. On a still, clear night the ground radiates
    heat to the sky and the air above it stratifies, so cold air drains and
    pools; wind mixes that away and cloud puts a lid on the radiation. The
    forecast low is a grid-cell average, so on exactly the nights frost
    happens it is optimistic for low ground and pessimistic for high.

    Returns a multiplier on the terrain drainage term, plus a plain reason.
    """
    if wind_mph is None or cloud_pct is None:
        return 0.5, "wind and sky unknown — assuming a middling night"

    calm = wind_mph <= 5.0
    breezy = wind_mph <= 9.0
    clear = cloud_pct <= 30.0
    partly = cloud_pct <= 65.0

    if calm and clear:
        return 1.0, "calm and clear — cold air will pool in the low ground"
    if (calm and partly) or (breezy and clear):
        return 0.65, "light wind or broken cloud — some pooling likely"
    if breezy or partly:
        return 0.35, "breeze and cloud will mix the air"
    return 0.15, "windy or overcast — little stratification"


def night_risk(
    forecast_low_f: float,
    drainage_f: float,
    wind_mph: float | None,
    cloud_pct: float | None,
) -> dict[str, Any]:
    """Assess one forecast night for the coldest ground in the region."""
    factor, reason = radiative_risk(wind_mph, cloud_pct)
    low_ground_f = forecast_low_f - drainage_f * factor

    if low_ground_f <= HARD_FREEZE_F:
        level = "hard_freeze"
    elif low_ground_f <= FROST_F:
        level = "frost_likely"
    elif low_ground_f <= FROST_WATCH_F:
        level = "frost_watch"
    else:
        level = "clear"

    return {
        "level": level,
        "forecast_low_f": round(forecast_low_f, 1),
        "low_ground_f": round(low_ground_f, 1),
        "drainage_applied_f": round(drainage_f * factor, 1),
        "wind_mph": wind_mph,
        "cloud_pct": cloud_pct,
        "reason": reason,
    }


LEVEL_RANK = {"clear": 0, "frost_watch": 1, "frost_likely": 2, "hard_freeze": 3}


def worst(nights: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The night that decides whether anyone covers beds this week."""
    if not nights:
        return None
    return max(nights, key=lambda n: (LEVEL_RANK.get(n["level"], 0), -n["low_ground_f"]))


def last_spring_frost(dates: list[str], tmin: list[float | None], year: int) -> str | None:
    """The LAST date on or before Jun 30 of ``year`` with a min at or below freezing.

    The date a tender crop can finally go out. Note it is the last, not the
    first: the season opens when the freezes stop, and a grower who plants
    after the first thaw rather than the last frost loses the crop.
    """
    cutoff = date(year, *SPRING_SEARCH_END)
    found: str | None = None
    for d, lo in zip(dates, tmin, strict=False):
        if lo is None:
            continue
        try:
            day = date.fromisoformat(d)
        except ValueError:
            continue
        if day.year == year and day <= cutoff and lo <= FROST_F:
            found = d
    return found


def spring_frost_dates(dates: list[str], tmin: list[float | None], years: list[int]) -> list[str]:
    """Last spring frost for each year that has one on record."""
    return [d for y in years if (d := last_spring_frost(dates, tmin, y))]
