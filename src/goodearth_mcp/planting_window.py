"""Assemble the planting calendar for a block.

Three fetches, whatever the crop list: the season's air record (for frost dates
and the accumulation rate), and — only when some crop names a germination
temperature — the soil record.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import frost, gdd, planting, soil, sources
from goodearth_mcp.region import Region

RECORD_SPAN_YEARS = 10


class PlantingWindowError(ValueError):
    """The request cannot be answered as asked."""


async def region_planting_window(
    region: Region,
    crops_in: Any,
    today: date | None = None,
) -> dict[str, Any]:
    """When each crop goes in on this ground, and how long the window is."""
    today = today or datetime.now(UTC).date()

    if not isinstance(crops_in, list) or not crops_in:
        raise PlantingWindowError("crops must be a non-empty list")
    if len(crops_in) > planting.MAX_CROPS:
        raise PlantingWindowError(
            f"{len(crops_in)} crops is more than one call should carry "
            f"(limit {planting.MAX_CROPS})"
        )

    parsed = [planting.validate(c) for c in crops_in]
    soil_wanted = sorted({c["min_soil_f"] for c in parsed if c["min_soil_f"] is not None})

    span_from = date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat()
    span_to = date(today.year - 1, 12, 31).isoformat()

    tasks: list[Any] = [
        sources.fetch_daily_history([region.centroid.lat], [region.centroid.lon], span_from, span_to)
    ]
    if soil_wanted:
        band = soil.BANDS[soil.DEFAULT_BAND]
        tasks.append(sources.fetch_soil_history(
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

    spring = frost.summarize_frost_dates(frost.spring_frost_dates(dates, tmin, years), today.year)
    fall = frost.summarize_frost_dates(frost.frost_dates(dates, tmin, years), today.year)
    if not spring and not fall:
        raise PlantingWindowError(
            "No frost record could be built for this ground — the archive may be too short."
        )

    last_frost = date.fromisoformat(spring["median"]) if spring else None
    first_frost = date.fromisoformat(fall["median"]) if fall else None

    # ── Soil warming dates, one per distinct threshold ───────────────────
    soil_dates: dict[float, date] = {}
    if soil_wanted and not isinstance(soil_rec, BaseException) and soil_rec:
        try:
            band = soil.BANDS[soil.DEFAULT_BAND]
            s_dates, s_temps = sources.daily_field(soil_rec, band["archive"])
            by_year: dict[int, tuple[list[str], list[float | None]]] = {}
            for d, t in zip(s_dates, s_temps, strict=False):
                b = by_year.setdefault(int(d[:4]), ([], []))
                b[0].append(d)
                b[1].append(t)
            for threshold in soil_wanted:
                hits = []
                for y in sorted(by_year):
                    c = soil.crossing(by_year[y][0], by_year[y][1], threshold, "warming")
                    if c:
                        hits.append(c)
                got = soil.typical_crossing(hits, today.year)
                if got:
                    soil_dates[threshold] = date.fromisoformat(got["median"])
        except (sources.UpstreamError, ValueError):
            soil_dates = {}

    # ── The season's accumulation rate, per base temperature ─────────────
    rates: dict[float, float] = {}
    if last_frost and first_frost:
        season_days = max((first_frost - last_frost).days, 1)
        for b in sorted({c["base_temp_f"] for c in parsed}):
            # Heat inside a median frost-free window, averaged over the record.
            per_year: list[float] = []
            for y in years:
                idx = [i for i, d in enumerate(dates) if d[:4] == str(y)]
                if not idx:
                    continue
                lo = next((i for i in idx if dates[i][5:] >= last_frost.strftime("%m-%d")), idx[0])
                hi = next((i for i in idx if dates[i][5:] >= first_frost.strftime("%m-%d")), idx[-1])
                if hi <= lo:
                    continue
                curve = gdd.accumulate(tmax[lo:hi], tmin[lo:hi], b)
                if curve:
                    per_year.append(curve[-1])
            if per_year:
                rates[b] = (sum(per_year) / len(per_year)) / season_days

    rows = [
        planting.assess(
            c, last_frost, first_frost,
            soil_dates.get(c["min_soil_f"]) if c["min_soil_f"] is not None else None,
            rates.get(c["base_temp_f"], 0.0),
            today,
        )
        for c in parsed
    ]
    rows.sort(key=planting.sort_key)

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "frost": {
            "last_spring_median": spring["median"] if spring else None,
            "last_spring_latest": spring["latest"] if spring else None,
            "first_fall_median": fall["median"] if fall else None,
            "first_fall_earliest": fall["earliest"] if fall else None,
            "seasons_on_record": len(years),
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
            "The latest-sowing date uses the season's average accumulation rate, "
            "so it is optimistic at the very end of the window — heat comes "
            "slower in September than in July. Requirements are the caller's own."
        ),
        "sources": [
            {**sources.feed_of(air),
             "role": f"{RECORD_SPAN_YEARS}-season frost record and heat rate"},
        ],
    }
