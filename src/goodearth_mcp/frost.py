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

from goodearth_mcp import gdd

# Frost forms at the plant well before the thermometer in the shelter reads
# 32 °F, because the shelter sits 1.5 m up and the coldest air is at the
# canopy. 36 °F at screen height is the conventional watch threshold.
FROST_F = 32.0
FROST_WATCH_F = 36.0
HARD_FREEZE_F = 28.0

def first_fall_frost(
    dates: list[str], tmin: list[float | None], year: int,
    start: tuple[int, int],
) -> str | None:
    """The first night at or below freezing in the season that begins on
    ``start`` of ``year`` and runs a full year.

    The search runs on past New Year. On the Gulf Coast a season's first
    frost can come in January, and stopping at Dec 31 dropped that season
    from the record and pulled the median early.
    """
    begin = gdd.on_year(year, *start)
    end = gdd.on_year(year + 1, *start)
    for d, lo in zip(dates, tmin, strict=False):
        if lo is None:
            continue
        try:
            day = date.fromisoformat(d)
        except ValueError:
            continue
        if begin <= day < end and lo <= FROST_F:
            return d
    return None


def season_start(dates: list[str], tmin: list[float | None]) -> tuple[int, int] | None:
    """The day this ground's frost season begins, read from its own record.

    The middle of the longest stretch of the calendar that never frosted in
    the record: mid-July in Vermont and on the Gulf Coast, mid-January south
    of the equator. A fixed Jul 15 put the Southern Hemisphere's season break
    in the middle of its frosts. ``None`` for ground that never frosted, or
    frosted on every day of the year — there is no season to find.
    """
    frosted = [False] * 365
    for d, lo in zip(dates, tmin, strict=False):
        if lo is None or lo > FROST_F:
            continue
        try:
            day = date.fromisoformat(d)
        except ValueError:
            continue
        frosted[gdd.on_year(2001, day.month, day.day).timetuple().tm_yday - 1] = True
    if not any(frosted) or all(frosted):
        return None
    # The longest run of frost-free days round the year, from any frosted day.
    first = frosted.index(True)
    best_len, best_mid, run = 0, 0, 0
    for k in range(1, 366):
        i = (first + k) % 365
        if frosted[i]:
            if run > best_len:
                best_len, best_mid = run, (i - run + run // 2) % 365
            run = 0
        else:
            run += 1
    mid = date(2001, 1, 1) + timedelta(days=best_mid)
    return (mid.month, mid.day)


def frost_dates(
    dates: list[str], tmin: list[float | None], years: list[int],
    start: tuple[int, int] | None = None,
) -> list[str]:
    """First frost of each season on record, a season beginning on ``start``
    of each year — this ground's own season start when not given."""
    start = start or season_start(dates, tmin)
    if start is None:
        return []
    out = []
    for y in years:
        d = first_fall_frost(dates, tmin, y, start)
        if d:
            out.append(d)
    return out


def summarize_frost_dates(iso_dates: list[str], reference_year: int) -> dict[str, Any] | None:
    """Median and earliest first-frost, expressed in the reference year.

    Dates are compared by day-of-year so seasons line up, then re-expressed
    against ``reference_year`` — a grower planning this August does not care
    that the median fell in 2019.
    """
    got = gdd.typical_dates(iso_dates, reference_year)
    if got is None:
        return None
    median, earliest, latest = got
    n = len(iso_dates)

    return {
        "median": median.isoformat(),
        "earliest": earliest.isoformat(),
        "latest": latest.isoformat(),
        "years_on_record": n,
        "note": (
            f"First fall frost (min at or below {FROST_F:.0f} °F) in each of the "
            f"last {n} seasons on record, at the region centroid."
        ),
    }


def season_of(day: date, start: tuple[int, int]) -> date:
    """The day the season holding ``day`` began."""
    begin = gdd.on_year(day.year, *start)
    return begin if day >= begin else gdd.on_year(day.year - 1, *start)


def season_day(day: date, start: tuple[int, int]) -> int:
    """Days since the season holding ``day`` began, so a January frost sorts
    after a December one."""
    return (day - season_of(day, start)).days


def season_so_far(
    dates: list[str], tmin: list[float | None], record_frosts: list[str], today: date,
    start: tuple[int, int],
) -> dict[str, Any] | None:
    """This season up to yesterday: its first frost, or none yet and when the
    record's seasons that were still frost-free by now went on to frost.

    The record's median is a date in a typical season. Once it has passed
    with no frost, it is no longer when frost is expected; the seasons that
    also went frost-free this long are the record that still applies.
    ``None`` with nothing observed since the season began.
    """
    begin = season_of(today, start)
    seen = [
        (d, lo) for d, lo in zip(dates, tmin, strict=False)
        if lo is not None and begin.isoformat() <= d < today.isoformat()
    ]
    if not seen:
        return None
    seen.sort()
    through = seen[-1][0]
    first = next((d for d, lo in seen if lo <= FROST_F), None)
    out: dict[str, Any] = {"first_frost": first, "through": through}
    if first is None:
        now = season_day(date.fromisoformat(through), start)
        later = [d for d in record_frosts if season_day(date.fromisoformat(d), start) > now]
        got = gdd.typical_dates(later, begin.year)
        out["given_none_yet"] = {
            **(
                {"median": got[0].isoformat(), "earliest": got[1].isoformat(), "latest": got[2].isoformat()}
                if got else {}
            ),
            "seasons": len(later),
            "of": len(record_frosts),
        }
    return out


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


def last_spring_frost(
    dates: list[str], tmin: list[float | None], year: int,
    start: tuple[int, int],
) -> str | None:
    """The LAST night at or below freezing before the midsummer that falls on
    ``start`` of ``year`` — this ground's spring, on either side of the equator.

    The date a tender crop can finally go out. Note it is the last, not the
    first: the season opens when the freezes stop, and a grower who plants
    after the first thaw rather than the last frost loses the crop.
    """
    begin, end = gdd.on_year(year - 1, *start), gdd.on_year(year, *start)
    found: str | None = None
    for d, lo in zip(dates, tmin, strict=False):
        if lo is None or lo > FROST_F:
            continue
        try:
            day = date.fromisoformat(d)
        except ValueError:
            continue
        if begin <= day < end:
            found = d
    return found


def spring_frost_dates(
    dates: list[str], tmin: list[float | None], years: list[int],
    start: tuple[int, int] | None = None,
) -> list[str]:
    """Last spring frost for each season that has one on record."""
    start = start or season_start(dates, tmin)
    if start is None:
        return []
    return [d for y in years if (d := last_spring_frost(dates, tmin, y, start))]


def frost_free_seasons(
    dates: list[str], tmin: list[float | None], years: list[int], start: tuple[int, int],
) -> list[dict[str, Any]]:
    """Each season's frost-free stretch: the last frost before its midsummer
    and the first after it, either of them ``None`` when it did not come."""
    return [
        {
            "midsummer": gdd.on_year(y, *start),
            "last_spring": last_spring_frost(dates, tmin, y, start),
            "first_fall": first_fall_frost(dates, tmin, y, start),
        }
        for y in years
    ]


def typical_around(anchor: date, days_from_midsummer: list[int]) -> dict[str, str] | None:
    """Median, earliest and latest of one frost date, as days from each
    season's midsummer, placed around ``anchor`` — so a southern spring
    frost lands in the year before the autumn one, where it belongs."""
    if not days_from_midsummer:
        return None
    ds = sorted(days_from_midsummer)
    n = len(ds)
    med = ds[n // 2] if n % 2 else (ds[n // 2 - 1] + ds[n // 2]) // 2
    on = lambda k: gdd.from_season_offset(anchor, k).isoformat()
    return {"median": on(med), "earliest": on(ds[0]), "latest": on(ds[-1])}


def offsets(seasons: list[dict[str, Any]], key: str) -> list[int]:
    """Days from each season's midsummer to its ``key`` frost, where it came."""
    return [
        gdd.season_offset(date.fromisoformat(s[key]), s["midsummer"]) for s in seasons if s.get(key)
    ]
