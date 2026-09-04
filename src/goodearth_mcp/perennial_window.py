"""Assemble the tree answer — this ground's winters, and what will live in them.

Two reads, and both are keys the ledger already warms:

* the deep record, ``Y-10-01-01`` to ``Y-1-12-31``, which `crop_status` fetches
  for its frost summary. Any span ending in the past is cached forever
  (`record_cache._fresh_until`), so this is free after the first ledger.
* the season so far, ``Y-01-01`` to today, which `crop_status` also fetches.

The second is not decoration. The deep record stops at the end of last year, so
on its own the most recent winter it can complete is a year stale — November and
December of last year sit in it while the January and February that finish that
winter do not. Joining the two spans closes it, at no extra cost, because both
are already in the cache.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import chill, gdd, perennial, record_cache, sources
from goodearth_mcp.region import Region

#: Matched to `crop_status.RECORD_SPAN_YEARS` on purpose — a different span
#: would be a different cache key and a needless second fetch of the same years.
RECORD_SPAN_YEARS = 10


class PerennialWindowError(ValueError):
    """The request cannot be answered as asked."""


def _joined(deep: Any, season: Any) -> tuple[list[str], list[float | None], list[float | None]]:
    """The deep record and the season so far, as one series in date order.

    The two spans never overlap — one ends 31 December, the other starts
    1 January — so this is a concatenation rather than a merge. Read defensively
    all the same: a feed that returned an unexpected shape should cost the
    current year, not the whole answer.
    """
    dates: list[str] = []
    tmax: list[float | None] = []
    tmin: list[float | None] = []

    for record in (deep, season):
        if isinstance(record, BaseException) or not record:
            continue
        try:
            d, hi, lo = sources.daily_series(record[0])
        except (sources.UpstreamError, IndexError, ValueError):
            continue
        dates.extend(d)
        tmax.extend(hi)
        tmin.extend(lo)

    return dates, tmax, tmin


async def region_tree_window(
    region: Region,
    trees_in: Any,
    today: date | None = None,
) -> dict[str, Any]:
    """Whether each tree lives and fruits on this ground, across the record."""
    today = today or datetime.now(UTC).date()

    if not isinstance(trees_in, list) or not trees_in:
        raise PerennialWindowError("trees must be a non-empty list")

    # One unusable row must not cost the rest — the fault fixed four times
    # elsewhere in this package before anyone wrote it down.
    parsed = []
    skipped = []
    for row in trees_in:
        try:
            parsed.append(_with_ref(perennial.validate_tree(row), row))
        except perennial.PerennialError as exc_:
            skipped.append({
                "name": str((row or {}).get("tree") or (row or {}).get("crop") or "?"),
                "reason": str(exc_),
            })

    deep, season = await asyncio.gather(
        record_cache.daily_history(
            [region.centroid.lat], [region.centroid.lon],
            date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat(),
            date(today.year - 1, 12, 31).isoformat(),
        ),
        record_cache.daily_history(
            [region.centroid.lat], [region.centroid.lon],
            gdd.season_start(today).isoformat(), today.isoformat(),
        ),
        return_exceptions=True,
    )

    if isinstance(deep, BaseException) or not deep:
        raise PerennialWindowError(f"could not read this ground's record: {deep}")

    dates, tmax, tmin = _joined(deep, season)
    if not dates:
        raise PerennialWindowError("the record for this ground is unreadable")

    winters = chill.banked(dates, tmax, tmin)
    lows = perennial.winter_lows(dates, tmin)

    rows = [perennial.assess(t, winters, lows) for t in parsed]
    for t, row in zip(parsed, rows, strict=True):
        if t.get("ref"):
            row["ref"] = t["ref"]
    rows.sort(key=perennial.sort_key)

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "trees": rows,
        "skipped": skipped,
        "winters": winters,
        "chill": chill.summarize(winters),
        "summary": _summary(rows),
        "note": (
            "Hardiness limits and chill requirements are the caller's own — "
            "they are cultivar figures and vary widely within a species. Good "
            "Earth computes what this ground delivered against them; it does "
            "not publish agronomy. Confirm the numbers against the nursery tag "
            "or your local extension service."
        ),
        "sources": [
            {**sources.feed_of(deep), "role": "winter record"},
        ],
    }


def _with_ref(parsed: dict, row: Any) -> dict:
    """Carry the saved item's id onto its validated form, unread."""
    ref = str((row or {}).get("ref") or "") if isinstance(row, dict) else ""
    if ref:
        parsed["ref"] = ref
    return parsed


def _summary(rows: list[dict[str, Any]]) -> str:
    """The answer a grower acts on, before the table."""
    if not rows:
        return "No trees to judge."

    cold = [r for r in rows if r["hardiness"]["verdict"] in ("too_cold", "risky")]
    short = [r for r in rows if r["chill"]["verdict"] in ("short", "marginal")]

    if cold:
        names = ", ".join(r["tree"] for r in cold[:3])
        return (
            f"{len(cold)} of {len(rows)} would not reliably survive a winter "
            f"here — {names}{'…' if len(cold) > 3 else ''}."
        )
    if short:
        names = ", ".join(r["tree"] for r in short[:3])
        return (
            f"All {len(rows)} survive here; {len(short)} would not reliably get "
            f"the chill they need — {names}{'…' if len(short) > 3 else ''}."
        )
    return f"All {len(rows)} survive and get their chill on this ground."
