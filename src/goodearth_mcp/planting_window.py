"""Assemble the planting calendar for a block.

Three fetches, whatever the crop list: the season's air record (for frost dates
and the accumulation rate), and — only when some crop names a germination
temperature — the soil record.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from typing import Any

from goodearth_mcp import frost, gdd, planting, record_cache, soil, sources
from goodearth_mcp.region import Region

RECORD_SPAN_YEARS = 10


class PlantingWindowError(ValueError):
    """The request cannot be answered as asked."""


async def _air_record(region: Region, today: date) -> tuple[list[str], list, list]:
    """This ground's daily air record over the span every answer here reads."""
    span_from = date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat()
    span_to = date(today.year - 1, 12, 31).isoformat()
    try:
        air = await record_cache.daily_history(
            [region.centroid.lat], [region.centroid.lon], span_from, span_to)
    except (sources.UpstreamError, OSError) as exc:
        raise PlantingWindowError(f"could not read this ground's record: {exc}") from exc
    if not air:
        raise PlantingWindowError("could not read this ground's record")
    try:
        return sources.daily_series(air[0])
    except (sources.UpstreamError, IndexError) as exc:
        raise PlantingWindowError(f"the record is unreadable: {exc}") from exc


def _frost_season(
    dates: list[str], tmin: list, today: date,
) -> tuple[int, tuple[int, int] | None, dict[str, Any] | None, dict[str, Any] | None]:
    """The season being planned, its frost anchor, and its typical frosts.

    The frost-free stretch sits round this ground's own midsummer — July in
    the north, January in the south — so a southern spring frost belongs to
    the season of the autumn after it, not to the calendar year.
    """
    years = list(range(today.year - RECORD_SPAN_YEARS, today.year))
    start = frost.season_start(dates, tmin)
    if start is None:
        # Ground whose record never froze has no frost to plant around.
        return today.year, None, None, None
    seasons = frost.frost_free_seasons(dates, tmin, years, start)
    spring_off = frost.offsets(seasons, "last_spring")
    fall_off = frost.offsets(seasons, "first_fall")
    season = planting.plan_season(frost.season_of(today, start), fall_off, today)
    anchor = gdd.on_year(season, *start)
    spring = frost.typical_around(anchor, spring_off)
    fall = frost.typical_around(anchor, fall_off)
    if not spring and not fall:
        raise PlantingWindowError(
            "No frost record could be built for this ground — the archive may be too short."
        )
    return season, start, spring, fall


async def region_heat_for_days(
    region: Region,
    days: int,
    base_f: float,
    out_on: date | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """A packet's days to maturity, as the heat target they hold on this ground.

    Counted from `out_on` when the grower gives it — the day it went in, or
    will — and otherwise from this ground's typical last spring frost, the day
    a tender crop typically goes out. Summed over the typical heat for each
    calendar day across the last ten years, at the planting's base.
    """
    today = today or datetime.now(UTC).date()
    days = int(days)
    dates, tmax, tmin = await _air_record(region, today)
    clim = gdd.climatology(dates, tmax, tmin, base_f)
    if not clim:
        raise PlantingWindowError("this ground's record holds no usable temperatures")

    counted_from = "set_out"
    if out_on is None:
        season, _start, spring, _fall = _frost_season(dates, tmin, today)
        if spring:
            out_on, counted_from = date.fromisoformat(spring["median"]), "typical_last_frost"
        else:
            out_on, counted_from = date(season, 5, 15), "mid_may"

    heat = planting.heat_over(out_on, days, clim)
    years = sorted({d[:4] for d in dates})
    return {
        "success": True,
        # To the nearest ten: it is an estimate, and a figure to the degree-day
        # would claim a precision the method does not have.
        "gdd_target": int(round(heat / 10.0) * 10),
        "base_temp_f": base_f,
        "days_to_maturity": days,
        "counted_from": counted_from,
        "from": out_on.isoformat(),
        "to": (out_on + timedelta(days=days - 1)).isoformat(),
        "record": f"{years[0]}–{years[-1]}" if years else "",
        "region": region.describe(),
        "note": (
            "An estimate: the heat this many days hold in a typical year on this "
            "ground. A packet's days were counted where the breeder grew it; "
            "degree days are the figure that travels. Your own count from a "
            "season here beats it."
        ),
    }


async def region_planting_window(
    region: Region,
    crops_in: Any,
    today: date | None = None,
) -> dict[str, Any]:
    """When each crop goes in on this ground, and how long the window is."""
    today = today or datetime.now(UTC).date()

    if not isinstance(crops_in, list) or not crops_in:
        raise PlantingWindowError("crops must be a non-empty list")

    parsed = [planting.validate(c) for c in crops_in]
    soil_wanted = sorted({c["min_soil_f"] for c in parsed if c["min_soil_f"] is not None})

    lat = region.centroid.lat
    span_from = date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat()
    span_to = date(today.year - 1, 12, 31).isoformat()

    tasks: list[Any] = [
        record_cache.daily_history([region.centroid.lat], [region.centroid.lon], span_from, span_to)
    ]
    if soil_wanted:
        band = soil.BANDS[soil.DEFAULT_BAND]
        tasks.append(record_cache.soil_history(
            region.centroid.lat, region.centroid.lon, band["archive"], span_from, span_to
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    air = results[0]
    soil_rec = results[1] if len(results) > 1 else None

    if isinstance(air, BaseException) or not air:
        raise PlantingWindowError(f"could not read this ground's record: {air}")

    try:
        dates, tmax, tmin = sources.daily_series(air[0])
    except (sources.UpstreamError, IndexError) as exc:
        raise PlantingWindowError(f"the record is unreadable: {exc}") from exc

    years = list(range(today.year - RECORD_SPAN_YEARS, today.year))
    season, start, spring, fall = _frost_season(dates, tmin, today)

    last_frost = date.fromisoformat(spring["median"]) if spring else None
    first_frost = date.fromisoformat(fall["median"]) if fall else None
    earliest_frost = date.fromisoformat(fall["earliest"]) if fall else None

    # ── Soil warming dates, one per distinct threshold ───────────────────
    soil_dates: dict[float, date] = {}
    if soil_wanted and not isinstance(soil_rec, BaseException) and soil_rec:
        try:
            band = soil.BANDS[soil.DEFAULT_BAND]
            s_dates, s_temps = sources.daily_field(soil_rec, band["archive"])
            soil_seasons = soil.by_season(s_dates, s_temps, lat).values()
            # The spring that leads into the planned season's midsummer.
            spring_of = gdd.season_start(gdd.on_year(season, *start) if start else today, lat)
            for threshold in soil_wanted:
                hits = [
                    c for days_, temps_ in soil_seasons
                    if (c := soil.crossing(days_, temps_, threshold, "warming", lat))
                ]
                got = soil.typical_crossing(hits, lat, spring_of)
                if got:
                    soil_dates[threshold] = date.fromisoformat(got["median"])
        except (sources.UpstreamError, ValueError):
            soil_dates = {}

    # ── This ground's typical heat for each calendar day, per base ───────
    # Day by day rather than one season-long average, so a September sowing
    # is given September's heat. The latest sowing date and every
    # succession's finish are the same arithmetic over the same table.
    climates = {
        b: gdd.climatology(dates, tmax, tmin, b)
        for b in sorted({c["base_temp_f"] for c in parsed})
    }

    rows = [
        planting.assess(
            c, last_frost, first_frost,
            soil_dates.get(c["min_soil_f"]) if c["min_soil_f"] is not None else None,
            climates.get(c["base_temp_f"], {}),
            today,
            earliest_frost,
            frost_free=start is None,
        )
        for c in parsed
    ]
    rows.sort(key=planting.sort_key)

    return {
        "success": True,
        "as_of": today.isoformat(),
        # The season these dates are for — next year's, once this year's
        # first frost has typically come.
        "season": season,
        "region": region.describe(),
        "frost": {
            "last_spring_median": spring["median"] if spring else None,
            "last_spring_latest": spring["latest"] if spring else None,
            "first_fall_median": fall["median"] if fall else None,
            "first_fall_earliest": fall["earliest"] if fall else None,
            "seasons_on_record": len(years),
            "frost_free": start is None,
        },
        "soil_warming": {str(k): v.isoformat() for k, v in soil_dates.items()},
        "crops": rows,
        "sow_now": [r["crop"] for r in rows if r["sow_now"]],
        "summary": (
            f"{sum(1 for r in rows if r['state'] == 'open')} have an open window, "
            f"{sum(1 for r in rows if r['state'] == 'narrow')} are narrow, "
            f"{sum(1 for r in rows if r['state'] == 'will_not_fit')} will not fit outdoors here."
        ),
        "note": (
            "Dates are medians from this ground's own record, not a zone map. "
            "The latest-sowing date, and each succession's finish, count this "
            "ground's typical heat day by day, so a late sowing is given the "
            "slower heat of September rather than July's. A typical year, not a "
            "forecast. Requirements are the caller's own."
            + (f" This year's first frost has typically come, so these dates are for {season}."
               if season > today.year else "")
        ),
        "sources": [
            {**sources.feed_of(air),
             "role": f"{RECORD_SPAN_YEARS}-season frost record and heat rate"},
        ],
    }
