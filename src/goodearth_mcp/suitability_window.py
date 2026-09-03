"""Assemble the suitability answer — this block's heat budget, and what fits it.

The budget is measured, not assumed: how much heat this ground actually
accumulated inside its own frost-free window, averaged over the seasons on
record. That is the number a crop's requirement has to be judged against, and
it is different for a bench and a hollow on the same farm.
"""

from __future__ import annotations

import statistics
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import frost, gdd, sources, suitability
from goodearth_mcp.region import Region

RECORD_SPAN_YEARS = 8


class SuitabilityWindowError(ValueError):
    """The request cannot be answered as asked."""


def _season_budget(
    dates: list[str],
    tmax: list[float | None],
    tmin: list[float | None],
    base_f: float,
    years: list[int],
) -> tuple[float | None, int | None]:
    """Mean heat accumulated inside the frost-free window, and its length.

    Counting from Jan 1 would credit the block with heat that arrives before
    anything can be planted into it. The frost-free window is the season a
    grower actually has.
    """
    by_year: dict[int, tuple[list[str], list[float | None], list[float | None]]] = {}
    for i, d in enumerate(dates):
        y = int(d[:4])
        b = by_year.setdefault(y, ([], [], []))
        b[0].append(d)
        b[1].append(tmax[i] if i < len(tmax) else None)
        b[2].append(tmin[i] if i < len(tmin) else None)

    budgets: list[float] = []
    lengths: list[int] = []
    for y in years:
        got = by_year.get(y)
        if not got:
            continue
        y_dates, y_max, y_min = got

        # Last spring frost, then first fall frost — the window between.
        spring_end = None
        for i, (d, lo) in enumerate(zip(y_dates, y_min, strict=False)):
            if lo is not None and lo <= frost.FROST_F and date.fromisoformat(d).month <= 6:
                spring_end = i
        fall_start = None
        first = frost.first_fall_frost(y_dates, y_min, y)
        if first:
            fall_start = y_dates.index(first)

        lo_i = (spring_end + 1) if spring_end is not None else 0
        hi_i = fall_start if fall_start is not None else len(y_dates)
        if hi_i - lo_i < 30:
            continue

        curve = gdd.accumulate(y_max[lo_i:hi_i], y_min[lo_i:hi_i], base_f)
        if curve:
            budgets.append(curve[-1])
            lengths.append(hi_i - lo_i)

    if not budgets:
        return None, None
    return (
        round(statistics.median(budgets), 1),
        round(statistics.median(lengths)) if lengths else None,
    )


async def region_suitability(
    region: Region,
    crops_in: Any,
    today: date | None = None,
) -> dict[str, Any]:
    """What finishes on this ground, and with how much room to spare."""
    today = today or datetime.now(UTC).date()

    if not isinstance(crops_in, list) or not crops_in:
        raise SuitabilityWindowError("crops must be a non-empty list")
    if len(crops_in) > suitability.MAX_CROPS:
        raise SuitabilityWindowError(
            f"{len(crops_in)} crops is more than one call should carry "
            f"(limit {suitability.MAX_CROPS})"
        )

    # One unusable row must not cost the rest. Found by the guard in
    # tests/test_partial_knowledge.py after the same bug was fixed four times
    # elsewhere and still lived here.
    parsed = []
    skipped = []
    for row in crops_in:
        try:
            parsed.append(suitability.validate_crop(row))
        except suitability.SuitabilityError as exc_:
            skipped.append({"name": str((row or {}).get("crop") or "?"), "reason": str(exc_)})

    try:
        record = await sources.fetch_daily_history(
            [region.centroid.lat], [region.centroid.lon],
            date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat(),
            date(today.year - 1, 12, 31).isoformat(),
        )
    except sources.UpstreamError as exc:
        raise SuitabilityWindowError(f"could not read this ground's record: {exc}") from exc

    if not record:
        raise SuitabilityWindowError("the archive returned no seasons for this region")

    try:
        dates, tmax, tmin = sources.daily_series(record[0])
    except (sources.UpstreamError, IndexError) as exc:
        raise SuitabilityWindowError(f"the record is unreadable: {exc}") from exc

    years = list(range(today.year - RECORD_SPAN_YEARS, today.year))
    budgets: dict[float, float] = {}
    window_days: int | None = None
    for b in sorted({c["base_temp_f"] for c in parsed}):
        heat, days = _season_budget(dates, tmax, tmin, b, years)
        if heat is not None:
            budgets[b] = heat
        if window_days is None:
            window_days = days

    if not budgets:
        raise SuitabilityWindowError(
            "Could not measure a frost-free season here — the record may be too short."
        )

    rows = [suitability.assess(c, budgets, window_days) for c in parsed]
    rows.sort(key=suitability.sort_key)

    counts: dict[str, int] = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1

    return {
        "success": True,
        "skipped": skipped,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "budget": {
            "frost_free_days": window_days,
            "gdd_by_base": {str(k): v for k, v in budgets.items()},
            "seasons_on_record": len(years),
            "note": (
                "Heat accumulated inside the frost-free window, median across "
                f"the last {len(years)} seasons. Counting from Jan 1 would credit "
                "this ground with heat that arrives before anything can be "
                "planted into it."
            ),
        },
        "crops": rows,
        "counts": counts,
        "summary": (
            f"{counts.get('comfortable', 0)} finish comfortably, "
            f"{counts.get('tight', 0) + counts.get('marginal', 0)} are tight, "
            f"{counts.get('too_short', 0)} will not finish outdoors here."
        ),
        "note": (
            "Requirements are the caller's own. Published degree-day figures "
            "vary by cultivar and maturity group — a corn hybrid is sold by its "
            "relative maturity precisely because 'corn' has no single number. "
            "Good Earth computes against your ground; it does not publish agronomy."
        ),
        "sources": [
            {**sources.feed_of(record), "role": f"{RECORD_SPAN_YEARS}-season frost and heat record"},
        ],
    }
