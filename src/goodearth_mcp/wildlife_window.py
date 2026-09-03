"""Assemble the wildlife calendar for a region.

Shares one season curve per distinct base temperature across the heat-driven
events, and computes day length exactly for the photoperiod ones — so a whole
year's worth of species costs one round trip and no astronomy is guessed at.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import crops, gdd, record_cache, sources, wildlife
from goodearth_mcp.region import Region


class WildlifeWindowError(ValueError):
    """The request cannot be answered as asked."""


def _with_ref(parsed: dict, row) -> dict:
    """Carry the saved item's id onto its validated form.

    Stamped here rather than inside the validator, which returns a fixed shape
    on purpose — the domain modules compute against crops and creatures and
    have no business holding a database id. It rides along and is never read.
    """
    ref = str((row or {}).get("ref") or "") if isinstance(row, dict) else ""
    if ref:
        parsed["ref"] = ref
    return parsed


async def region_wildlife(
    region: Region,
    events: Any,
    today: date | None = None,
) -> dict[str, Any]:
    """Where each event stands on this ground, and which are due soon."""
    today = today or datetime.now(UTC).date()

    if not isinstance(events, list) or not events:
        raise WildlifeWindowError("events must be a non-empty list")
    if len(events) > wildlife.MAX_EVENTS:
        raise WildlifeWindowError(
            f"{len(events)} events is more than one call should carry "
            f"(limit {wildlife.MAX_EVENTS})"
        )

    # Validated one at a time. As a list comprehension, one unusable row raised
    # and the grower lost the whole page — a single roster entry hid seventeen
    # tracked creatures. What cannot be dated is reported, not fatal.
    parsed = []
    skipped = []
    for row in events:
        try:
            parsed.append(_with_ref(wildlife.validate_event(row), row))
        except wildlife.WildlifeError as exc_:
            skipped.append({"name": str((row or {}).get("species") or "?"), "reason": str(exc_)})
    # A roster entry names a creature the grower watches for, not an event
    # with a date. It belongs in the answer, but not in any of the arithmetic
    # below — there is nothing to count toward.
    roster = [e for e in parsed if e.get("roster_only")]
    parsed = [e for e in parsed if not e.get("roster_only")]

    needs_heat = any(e["driver"] == "heat" for e in parsed)
    needs_light = any(e["driver"] == "daylight" for e in parsed)

    dates: list[str] = []
    curves: dict[float, list[float]] = {}
    daylight: list[float | None] = []
    # Bound here, not only inside the branch below. A roster of nothing but
    # calendar and interval events needs no weather at all — "swallows arrive
    # about 20 April", a gestation count — and that is an ordinary list, not a
    # degenerate one. Left unbound, the provenance block at the end raised
    # UnboundLocalError and took the whole page with it: the grower lost every
    # creature they track because none of them happened to need heat.
    record: Any = None

    if needs_heat or needs_light:
        start = gdd.season_start(today)
        try:
            record = await record_cache.almanac_history(
                region.centroid.lat, region.centroid.lon,
                start.isoformat(), today.isoformat(),
            )
        except sources.UpstreamError as exc:
            raise WildlifeWindowError(f"could not read the season for this ground: {exc}") from exc

        block = sources.daily_block(record)
        dates = [str(d) for d in (block.get("time") or [])]
        if not dates:
            raise WildlifeWindowError("the archive returned no days for this region")

        def num(v: Any) -> float | None:
            return float(v) if isinstance(v, (int, float)) else None

        if needs_heat:
            tmax = [num(v) for v in (block.get("temperature_2m_max") or [])]
            tmin = [num(v) for v in (block.get("temperature_2m_min") or [])]
            for b in sorted({e["base_temp_f"] for e in parsed if e["driver"] == "heat"}):
                curves[b] = gdd.accumulate(tmax, tmin, b)

        if needs_light:
            daylight = [
                (v / 3600.0) if isinstance(v, (int, float)) else None
                for v in (block.get("daylight_duration") or [])
            ]

    rows: list[dict[str, Any]] = []
    for e in parsed:
        if e["driver"] == "heat":
            curve = curves[e["base_temp_f"]]
            detail = wildlife.heat_event(e, dates, curve, crops.recent_rate(curve), today)
        elif e["driver"] == "daylight":
            detail = wildlife.daylight_event(
                e, dates, daylight, region.centroid.lat, today
            )
        elif e["driver"] == "interval":
            detail = wildlife.interval_event(e, today)
        else:
            detail = wildlife.calendar_event(e, today)
        rows.append({
            # Which saved watch this is. One bird's arrival and its departure
            # are two rows about one species — the owner's own case.
            **({"ref": e["ref"]} if e.get("ref") else {}),
            "species": e["species"], "event": e["event"],
            "emoji": e["emoji"], "note": e["note"] or None,
            **detail,
        })

    soon = wildlife.upcoming(rows, today)
    seen = [r for r in rows if r.get("reached_on")]

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "events": rows,
        "roster": [
            {"species": e["species"], "emoji": e.get("emoji", ""),
             "role": e.get("role", "")}
            for e in roster
        ],
        "skipped": skipped,
        "due_soon": soon,
        "summary": (
            f"{len(seen)} of {len(rows)} already this season"
            + (f"; {len(soon)} due in the next three weeks." if soon else ".")
        ),
        "note": (
            "These are your own thresholds. Good Earth works out when they "
            "arrive on your ground; it does not publish natural history — the "
            "number that is right for a particular valley belongs to a local "
            "naturalist, an extension bulletin, or your own years of noticing. "
            "Daylight-driven dates are astronomy and barely move; heat-driven "
            "ones move with the season."
        ),
        "sources": [
            {**sources.feed_of(record), "role": "season heat and day length"},
        ],
    }
