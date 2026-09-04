"""Assemble the pest threshold answer — which rows to walk this week.

Shares one season curve across every pest model in the call, grouped by base
temperature, so asking about six pests costs one round trip.

The thresholds themselves come from the caller. This service computes when a
model's stages arrive on this ground; it does not assert what those stages are.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import crops, gdd, pests, record_cache, sources
from goodearth_mcp.region import Region

#: How many rows one call may carry.
#:
#: A guard against a hostile caller, not a page size. Every one of these
#: answers shares ONE cached read of the ground and then does arithmetic per
#: row — the pest and crop paths build one heat curve per distinct BASE
#: TEMPERATURE rather than one per row, and the tree path builds none at all —
#: so the marginal cost of the fortieth row is a few comparisons. What the
#: limit actually protects is the size of the response.
#:
#: These were sized against the catalogue and the roster as they stood, which
#: is how this one broke as soon as a grower watched an eleventh pest. A limit set to today's list is a
#: tripwire under tomorrow's, so they are now set to what the constraint is
#: rather than to what the data happened to be, and `tests/test_call_limits.py`
#: holds them against what actually ships.
MAX_MODELS = 40


class PestWindowError(ValueError):
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


async def region_pest_window(
    region: Region,
    models: Any,
    today: date | None = None,
) -> dict[str, Any]:
    """Stage status and crossing dates for each pest model on this ground."""
    today = today or datetime.now(UTC).date()

    if not isinstance(models, list) or not models:
        raise PestWindowError("pests must be a non-empty list of models")
    if len(models) > MAX_MODELS:
        raise PestWindowError(
            f"{len(models)} models is more than one call should carry (limit {MAX_MODELS})"
        )

    # Validated one at a time. As a list comprehension, one unusable row raised
    # and the grower lost the whole page — a single roster entry hid seventeen
    # tracked creatures. What cannot be dated is reported, not fatal.
    parsed = []
    skipped = []
    for row in models:
        try:
            parsed.append(_with_ref(pests.validate_model(row), row))
        except pests.PestError as exc_:
            skipped.append({"name": str((row or {}).get("pest") or "?"), "reason": str(exc_)})

    start = gdd.season_start(today)
    try:
        history = await record_cache.daily_history(
            [region.centroid.lat], [region.centroid.lon],
            start.isoformat(), today.isoformat(),
        )
    except sources.UpstreamError as exc:
        raise PestWindowError(f"could not read the season for this ground: {exc}") from exc

    if not history:
        raise PestWindowError("the archive returned no data for this region")

    try:
        dates, tmax, tmin = sources.daily_series(history[0])
    except (sources.UpstreamError, IndexError) as exc:
        raise PestWindowError(f"the season record is unreadable: {exc}") from exc

    # One curve per distinct base temperature, not one per pest.
    bases = sorted({p["base_temp_f"] for p in parsed})
    curves = {b: gdd.accumulate(tmax, tmin, b) for b in bases}

    # The ref rides onto the assessment rather than into it: `assess` computes
    # against a pest's stages and has no business holding a database id.
    assessments = [
        {**({"ref": p["ref"]} if p.get("ref") else {}),
         **pests.assess(p, dates, curves[p["base_temp_f"]],
                        crops.recent_rate(curves[p["base_temp_f"]]))}
        for p in parsed
    ]
    priority = pests.scouting_priority(assessments, today)

    return {
        "success": True,
        "skipped": skipped,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "pests": assessments,
        "scout_now": priority,
        # Said the way a grower would say it. "2 of 2 models worth walking"
        # is two pieces of jargon and a metaphor: they are not models to the
        # person reading, they are pests, and what they do is arrive.
        "summary": (
            f"{len(priority)} of {len(assessments)} pest"
            f"{'s' if len(assessments) != 1 else ''} active now."
            if priority else
            f"Nothing crossed or due in the next 10 days, across "
            f"{len(assessments)} pest{'s' if len(assessments) != 1 else ''}."
        ),
        "note": (
            "Thresholds are the caller's own models. Good Earth computes when "
            "they arrive on this ground; it does not publish entomology. "
            "Confirm the numbers against your local extension service."
        ),
        "sources": [
            {**sources.feed_of(history), "role": "season heat"},
        ],
    }
