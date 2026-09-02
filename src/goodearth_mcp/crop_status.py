"""Assemble the crop ledger — where every planting stands, and whether it finishes.

One priced call answers a whole block's plantings rather than one, because that
is how the question actually arrives: a grower looks at the ledger, not at a
single row. It shares the season curve and the frost record between them, so
the marginal cost of the fifth planting is arithmetic rather than another
round trip.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import crops, frost, gdd, sources
from goodearth_mcp.region import Region

MAX_PLANTINGS = 40
RECORD_SPAN_YEARS = 10


class LedgerError(ValueError):
    """The request cannot be answered as asked."""


async def region_crop_ledger(
    region: Region,
    plantings: Any,
    base_temp_f: float = 50.0,
    today: date | None = None,
) -> dict[str, Any]:
    """Status and frost verdict for every planting on a block."""
    today = today or datetime.now(UTC).date()

    if not isinstance(plantings, list) or not plantings:
        raise LedgerError("plantings must be a non-empty list")
    if len(plantings) > MAX_PLANTINGS:
        raise LedgerError(
            f"{len(plantings)} plantings is more than one call should carry "
            f"(limit {MAX_PLANTINGS}) — split the block."
        )

    parsed_all = [crops.validate_planting(p) for p in plantings]
    # Presence rows have no set-out to count from. They are reported alongside
    # the ledger rather than dropped silently, so a grower can see which crops
    # are on the record but not yet being tracked.
    parsed = [p for p in parsed_all if p.get("set_out") is not None]
    untracked = [
        {"crop": p["crop"], "reason": "no set-out recorded"}
        for p in parsed_all if p.get("set_out") is None
    ]

    # Each crop counts heat from its own base temperature, so plantings are
    # grouped by base and one season curve is built per distinct base rather
    # than per planting.
    bases = sorted({p["base_temp_f"] or base_temp_f for p in parsed})

    start = gdd.season_start(today)
    cells_lat = [region.centroid.lat]
    cells_lon = [region.centroid.lon]

    history_task = sources.fetch_daily_history(
        cells_lat, cells_lon, start.isoformat(), today.isoformat()
    )
    frost_task = sources.fetch_daily_history(
        cells_lat, cells_lon,
        date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat(),
        date(today.year - 1, 12, 31).isoformat(),
    )
    history, frost_record = await asyncio.gather(
        history_task, frost_task, return_exceptions=True
    )

    if isinstance(history, BaseException) or not history:
        raise LedgerError(f"could not read the season for this ground: {history}")

    try:
        dates, tmax, tmin = sources.daily_series(history[0])
    except (sources.UpstreamError, IndexError) as exc:
        raise LedgerError(f"the season record is unreadable: {exc}") from exc

    curves = {b: gdd.accumulate(tmax, tmin, b) for b in bases}

    # Frost record is advisory: without it the ledger still reports where each
    # planting stands, and every finish verdict says "unknown" rather than
    # inventing a date.
    frost_summary = None
    if not isinstance(frost_record, BaseException) and frost_record:
        try:
            f_dates, _fmax, f_tmin = sources.daily_series(frost_record[0])
            years = list(range(today.year - RECORD_SPAN_YEARS, today.year))
            frost_summary = frost.summarize_frost_dates(
                frost.frost_dates(f_dates, f_tmin, years), today.year
            )
        except (sources.UpstreamError, IndexError, ValueError):
            frost_summary = None

    rows: list[dict[str, Any]] = []
    for p in parsed:
        base = p["base_temp_f"] or base_temp_f
        st = crops.status(p, dates, curves[base], today)
        st["base_temp_f"] = base
        st["finish"] = crops.finish_before_frost(
            st,
            frost_summary["median"] if frost_summary else None,
            frost_summary["earliest"] if frost_summary else None,
        )
        rows.append(st)

    at_risk = [r["crop"] for r in rows if r["finish"]["verdict"] == "wont_finish"]

    return {
        "untracked": untracked,
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "first_frost": frost_summary,
        "plantings": rows,
        "wont_finish": at_risk,
        "summary": (
            f"{len(rows)} planting{'s' if len(rows) != 1 else ''}; "
            + (f"{len(at_risk)} will not finish before the median first frost."
               if at_risk else "all on pace for the median first frost."
               if frost_summary else "no frost record, so finish verdicts are unknown.")
        ),
        "note": (
            "Heat is counted from each planting's own set-out date and base "
            "temperature. Projected dates carry the last two weeks' rate "
            "forward and are not a forecast."
        ),
        "sources": [
            {"name": "Open-Meteo archive (ERA5)", "role": "season heat and frost record",
             "resolution_m": sources.ARCHIVE_RESOLUTION_M},
        ],
    }
