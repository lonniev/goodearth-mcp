"""What will finish here — the block's heat budget against a crop's need.

"What can I grow?" is not a lookup. Two farms in the same county, one on a
bench and one in a hollow, have different answers, and a crop that finishes
reliably in nine years out of ten is a different proposition from one that
finishes in five.

So this is computed rather than looked up: the block's own frost-free window
and the heat it accumulates inside it, against the heat a crop needs. The
answer that matters is not "yes" or "no" but **margin** — how much heat is left
over after the crop is done, expressed in the days a grower plans in.

**The crop requirements come from the caller.** Published degree-day figures
vary by cultivar, by maturity group, and by who published them; a corn hybrid
is sold by its relative maturity precisely because "corn" has no single number.
Good Earth computes against your ground; it does not publish agronomy.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from typing import Any

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
#: is how this one sat one preset away from refusing the crop library. A limit set to today's list is a
#: tripwire under tomorrow's, so they are now set to what the constraint is
#: rather than to what the data happened to be, and `tests/test_call_limits.py`
#: holds them against what actually ships.
MAX_CROPS = 200

# How much of the season's heat should remain after a crop finishes for it to
# count as comfortable rather than merely possible. A crop that finishes on the
# last warm day of an average year fails in half of them.
COMFORT_MARGIN = 0.15
TIGHT_MARGIN = 0.0


class SuitabilityError(ValueError):
    """The request cannot be answered as asked."""


def validate_crop(c: Any) -> dict[str, Any]:
    """Check one caller-supplied crop requirement."""
    if not isinstance(c, dict):
        raise SuitabilityError("each crop must be an object with crop and gdd_target")

    name = str(c.get("crop") or c.get("name") or "").strip()
    if not name:
        raise SuitabilityError("a crop needs a name")

    try:
        target = float(c["gdd_target"])
    except (KeyError, TypeError, ValueError) as exc:
        raise SuitabilityError(f"{name}: gdd_target must be a number of degree days") from exc
    if not 1 <= target <= 20_000:
        raise SuitabilityError(f"{name}: gdd_target {target:g} is outside any real crop's range")

    base = c.get("base_temp", 50.0)
    try:
        base_f = float(base)
    except (TypeError, ValueError) as exc:
        raise SuitabilityError(f"{name}: base_temp must be a number in °F") from exc
    if not 20.0 <= base_f <= 80.0:
        raise SuitabilityError(f"{name}: base_temp must be 20–80 °F — Good Earth works in Fahrenheit")

    # Frost tolerance changes the question entirely: a hardy crop can use the
    # shoulders of the season a tender one cannot touch.
    hardy = bool(c.get("frost_hardy", False))

    return {
        "crop": name, "gdd_target": target, "base_temp_f": base_f,
        "frost_hardy": hardy,
        "category": str(c.get("category") or "").strip()[:40] or None,
        "emoji": str(c.get("emoji") or "").strip()[:4] or None,
    }


def verdict(available: float, needed: float) -> str:
    """How comfortably the season covers the crop."""
    if needed <= 0:
        return "unknown"
    if available < needed:
        return "too_short"
    slack = (available - needed) / needed
    if slack >= COMFORT_MARGIN:
        return "comfortable"
    if slack > TIGHT_MARGIN:
        return "tight"
    return "marginal"


def assess(
    crop: dict[str, Any],
    heat_by_base: dict[float, float],
    frost_free_days: int | None,
) -> dict[str, Any]:
    """One crop against the block's budget."""
    available = heat_by_base.get(crop["base_temp_f"])
    if available is None:
        return {**_ident(crop), "verdict": "unknown",
                "note": "No heat budget computed at this crop's base temperature."}

    needed = crop["gdd_target"]
    v = verdict(available, needed)
    surplus = round(available - needed, 1)

    # The rate MUST be taken at this crop's own base temperature. Dividing a
    # base-40 surplus by a base-50 rate reported 193 days of margin inside a
    # 190-day window — an impossible number that still looked plausible,
    # because a bigger margin is exactly what a low base ought to give.
    days = None
    if frost_free_days and available > 0:
        rate = available / frost_free_days
        if rate > 0:
            days = round(surplus / rate)
            # Margin cannot exceed the season it is measured in.
            days = max(-frost_free_days, min(days, frost_free_days))

    return {
        **_ident(crop),
        "season_gdd_available": round(available, 1),
        "gdd_needed": needed,
        "surplus_gdd": surplus,
        "surplus_days": days,
        "frost_free_days": frost_free_days,
        "verdict": v,
        "note": _note(v, days, crop["frost_hardy"]),
    }


def _ident(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "crop": c["crop"], "emoji": c["emoji"], "category": c["category"],
        "gdd_target": c["gdd_target"], "base_temp_f": c["base_temp_f"],
        "frost_hardy": c["frost_hardy"],
    }


def _note(v: str, days: int | None, hardy: bool) -> str:
    d = f"{abs(days)} days" if days is not None else "some margin"
    if v == "comfortable":
        return f"Finishes with about {d} of season to spare."
    if v == "tight":
        return f"Finishes, but only by about {d} — a cool year could take it."
    if v == "marginal":
        return "Needs essentially the whole season; expect it to fail in cool years."
    if v == "too_short":
        return (
            f"About {d} short of finishing here"
            + (" — though a hardy crop can use the shoulders of the season."
               if hardy else " outdoors.")
        )
    return "Not enough information to judge."


RANK = {"comfortable": 0, "tight": 1, "marginal": 2, "too_short": 3, "unknown": 4}


def sort_key(row: dict[str, Any]) -> tuple[int, float]:
    return (RANK.get(row.get("verdict", "unknown"), 9), -(row.get("surplus_gdd") or 0))
