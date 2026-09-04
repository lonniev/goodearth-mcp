"""Will a tree live here, and will it fruit here.

The crop model asks "does it finish before frost", which is a question only
something that must finish in one season can be asked. A tree is not asked it.
A tree is asked two others, both settled before it goes in the ground:

* **Will it survive?** Every winter on record has a coldest night. A cultivar
  has a limit. The answer is how often the first went below the second.
* **Will it fruit?** A deciduous fruit tree needs chill hours to break
  dormancy cleanly. The answer is how many winters on record delivered them.

Both are answered as a **frequency across the record**, not as a yes. A tree
that survives nine winters in ten is a different proposition from one that
survives five, and the two have the same verdict under any threshold that
returns a single word — which is why `suitability` reports margin rather than
"yes", and why this reports a count.

**The requirement is the caller's.** Hardiness limits and chill requirements
are cultivar figures and vary widely within a species; they arrive from the
nursery tag, exactly as `gdd_target` does. Good Earth computes what this ground
delivered and does not publish agronomy.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from goodearth_mcp import chill

MAX_TREES = 40

#: A cultivar's cold limit, in °F. The range brackets everything from citrus,
#: which is lost near 26 °F, to a boreal species good past 50 below.
MIN_HARDY_F = -60.0
MAX_HARDY_F = 40.0

#: Chill requirements run from near zero for low-chill peaches to about 1,500
#: hours for the longest-chill apples. Anything outside is a typo.
MAX_CHILL_HOURS = 2_000.0

#: How often a winter may cross the limit before the answer stops being "yes".
#: One winter in ten is a tree that takes damage in a hard year; a third of
#: them is a tree that will not make an orchard.
MARGINAL_SHARE = 0.10
TOO_COLD_SHARE = 0.30

#: And how often the chill must arrive. A cultivar that gets its hours in half
#: the winters crops in half of them.
RELIABLE_SHARE = 1.0
USUAL_SHARE = 0.80
CHILL_MARGINAL_SHARE = 0.50


class PerennialError(ValueError):
    """A tree cannot be evaluated as described."""


def validate_tree(t: Any) -> dict[str, Any]:
    """Check one caller-supplied tree. Tool input is adversarial."""
    if not isinstance(t, dict):
        raise PerennialError("each tree must be an object with a name")

    name = str(t.get("tree") or t.get("crop") or t.get("name") or "").strip()
    if not name:
        raise PerennialError("a tree needs a name")

    # Both figures are optional, and a tree with neither is still a valid row.
    # "There is a hedgerow of black cherry along the north line" is a true
    # thing to record, and demanding a chill requirement for it would invite
    # exactly the fabricated number the whole service refuses to publish.
    chill_hours = _number(t.get("chill_hours"), name, "chill_hours")
    if chill_hours is not None and not 0 <= chill_hours <= MAX_CHILL_HOURS:
        raise PerennialError(
            f"{name}: chill_hours of {chill_hours:g} is outside any real cultivar's range"
        )

    hardy_to_f = _number(t.get("hardy_to_f"), name, "hardy_to_f")
    if hardy_to_f is not None and not MIN_HARDY_F <= hardy_to_f <= MAX_HARDY_F:
        raise PerennialError(
            f"{name}: hardy_to_f must be between {MIN_HARDY_F:g} and {MAX_HARDY_F:g} °F "
            "— Good Earth works in Fahrenheit"
        )

    return {
        "tree": name,
        "chill_hours": chill_hours,
        "hardy_to_f": hardy_to_f,
        "category": str(t.get("category") or "").strip()[:40] or None,
        "emoji": str(t.get("emoji") or "").strip()[:4] or None,
    }


def _number(raw: Any, name: str, field: str) -> float | None:
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise PerennialError(f"{name}: {field} must be a number") from exc


def winter_lows(dates: list[str], tmin: list[float | None]) -> list[dict[str, Any]]:
    """The coldest night of each winter on record.

    Grouped by `chill.dormancy_ending`, so a December night belongs to the
    winter it starts rather than the calendar year it falls in — the whole
    point being that a tree experiences one cold season, not two year-halves.

    Unlike chill, this is NOT restricted to the accumulation window: the
    coldest night of the year is often in late February or early March, past
    the point where chill stops counting, and it kills a tree just the same.
    """
    by_winter: dict[int, dict[str, Any]] = {}

    for i, iso in enumerate(dates):
        try:
            d = date.fromisoformat(iso)
        except ValueError:
            continue
        # Winter, broadly: everything but the growing season. A July night is
        # not the answer to "how cold does it get here".
        if 4 <= d.month <= 9:
            continue
        lo = tmin[i] if i < len(tmin) else None
        if lo is None:
            continue

        w = chill.dormancy_ending(d)
        got = by_winter.get(w)
        if got is None or lo < got["low_f"]:
            by_winter[w] = {"winter": w, "low_f": round(lo, 1), "on": iso}

    return sorted(by_winter.values(), key=lambda w: w["winter"])


def hardiness(lows: list[dict[str, Any]], hardy_to_f: float | None) -> dict[str, Any]:
    """How often this ground went below what the tree takes."""
    if not lows:
        return {"verdict": "unknown", "note": "No winter record for this ground."}

    coldest = min(lows, key=lambda w: w["low_f"])
    summary = {
        "record_low_f": coldest["low_f"],
        "record_low_on": coldest["on"],
        "winters_on_record": len(lows),
    }
    if hardy_to_f is None:
        return {**summary, "verdict": "unrated",
                "note": "No hardiness figure given, so nothing to judge it against."}

    below = [w for w in lows if w["low_f"] < hardy_to_f]
    share = len(below) / len(lows)
    verdict = (
        "hardy" if not below
        else "marginal" if share <= MARGINAL_SHARE
        else "risky" if share < TOO_COLD_SHARE
        else "too_cold"
    )

    return {
        **summary,
        "hardy_to_f": hardy_to_f,
        "winters_below": len(below),
        "coldest_margin_f": round(coldest["low_f"] - hardy_to_f, 1),
        "verdict": verdict,
        "note": _hardiness_note(verdict, len(below), len(lows), coldest, hardy_to_f),
    }


def _hardiness_note(
    verdict: str, below: int, total: int, coldest: dict[str, Any], limit: float,
) -> str:
    if verdict == "hardy":
        return (
            f"No winter in {total} went below {limit:g} °F. The coldest was "
            f"{coldest['low_f']:g} °F, {coldest['on']}."
        )
    return (
        f"{below} winter{'s' if below != 1 else ''} in {total} went below "
        f"{limit:g} °F — coldest {coldest['low_f']:g} °F, {coldest['on']}."
    )


def chill_delivery(
    winters: list[dict[str, Any]],
    needed_hours: float | None,
) -> dict[str, Any]:
    """How often this ground banked the hours the cultivar asks for."""
    summary = chill.summarize(winters)
    if summary is None:
        return {"verdict": "unknown",
                "note": "No whole winter on record to count chill across."}

    if needed_hours is None:
        return {**summary, "verdict": "unrated",
                "note": "No chill requirement given, so nothing to judge it against."}

    total = summary["winters_on_record"]
    met = chill.winters_meeting(winters, needed_hours)
    share = met / total

    verdict = (
        "reliable" if share >= RELIABLE_SHARE
        else "usual" if share >= USUAL_SHARE
        else "marginal" if share >= CHILL_MARGINAL_SHARE
        else "short"
    )

    return {
        **summary,
        "chill_hours_needed": needed_hours,
        "winters_meeting": met,
        "verdict": verdict,
        "note": (
            f"{met} winter{'s' if met != 1 else ''} in {total} banked the "
            f"{needed_hours:g} hours it asks for; the median is "
            f"{summary['median_hours']:g} and the lowest {summary['lowest_hours']:g}."
        ),
    }


def assess(
    tree: dict[str, Any],
    winters: list[dict[str, Any]],
    lows: list[dict[str, Any]],
) -> dict[str, Any]:
    """One tree against this ground's winters."""
    return {
        **{k: tree[k] for k in ("tree", "emoji", "category")},
        "hardiness": hardiness(lows, tree["hardy_to_f"]),
        "chill": chill_delivery(winters, tree["chill_hours"]),
    }


#: Worst first, so a tree that will not live here cannot be scrolled past.
#: Hardiness outranks chill: a tree that dies does not need its fruit set
#: discussed.
HARDINESS_RANK = {"too_cold": 0, "risky": 1, "marginal": 2, "hardy": 4,
                  "unrated": 5, "unknown": 6}
CHILL_RANK = {"short": 0, "marginal": 1, "usual": 2, "reliable": 4,
              "unrated": 5, "unknown": 6}


def sort_key(row: dict[str, Any]) -> tuple[int, int, str]:
    return (
        HARDINESS_RANK.get(row.get("hardiness", {}).get("verdict", "unknown"), 9),
        CHILL_RANK.get(row.get("chill", {}).get("verdict", "unknown"), 9),
        row.get("tree", ""),
    )
