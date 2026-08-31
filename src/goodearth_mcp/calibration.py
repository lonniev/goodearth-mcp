"""Calibration — how a block learns its own microclimate.

Every other tool here answers from a grid. The grid is 9 km across and the
terrain correction that refines it is a physical model, not a measurement of
*this* farm. What the model cannot know is the part that makes a farm
particular: the hedgerow that shades the north beds until ten, the pond that
holds heat, the outlet the cold air actually drains through.

The grower knows those. They observe first bloom, first frost, emergence — and
each observation is a measurement of the difference between what the model
predicted and what the ground did. Accumulate enough of them and the difference
stops being noise and becomes this block's correction.

That is the loop this module closes, and it is the one thing here that gets
better the longer a farm uses it.

Two kinds of observation, two kinds of bias:

* **A dated event the model also predicts** (first frost) yields a bias in
  *days* — this ground frosts about a week before the region does.
* **A crop stage reached on a date** yields a bias in *heat* — this ground
  accumulated 4% more degree-days than the grid credited it with, or this
  variety blooms at 1,150 GDD rather than the 1,200 the extension bulletin
  prints.

Both are reported separately and never merged, because they correct different
things and a grower is entitled to see which one their ground is doing.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

import statistics
from datetime import date
from typing import Any

# One observation is an anecdote. Two is a coincidence. Below this the bias is
# reported but explicitly NOT applied, because a single warm year would
# otherwise rewrite a farm's whole calendar.
MIN_FOR_CORRECTION = 3

# A correction beyond this is far likelier to be a mis-entered date or a
# mismatched crop target than a real microclimate. Refusing to apply it is the
# difference between a model that learns and one that can be poisoned by a typo.
MAX_HEAT_BIAS = 0.35     # ±35% on accumulated GDD
MAX_DAY_BIAS = 30        # ±30 days on a frost date

OBSERVATION_KINDS = {"frost", "stage"}


class CalibrationError(ValueError):
    """An observation cannot be used as described."""


def validate_observation(obs: Any) -> dict[str, Any]:
    """Check one field report. Reports arrive from a phone in a field."""
    if not isinstance(obs, dict):
        raise CalibrationError("each observation must be an object")

    kind = str(obs.get("kind") or "").strip().lower()
    if kind not in OBSERVATION_KINDS:
        raise CalibrationError(
            f"kind must be one of {', '.join(sorted(OBSERVATION_KINDS))}, got {kind!r}"
        )

    raw = obs.get("observed_on") or obs.get("date")
    if not raw:
        raise CalibrationError("an observation needs the date it was seen (YYYY-MM-DD)")
    try:
        observed_on = date.fromisoformat(str(raw))
    except ValueError as exc:
        raise CalibrationError(f"observed_on must be YYYY-MM-DD, got {raw!r}") from exc

    out: dict[str, Any] = {"kind": kind, "observed_on": observed_on,
                           "note": str(obs.get("note") or "").strip()[:400]}

    if kind == "stage":
        crop = str(obs.get("crop") or "").strip()
        if not crop:
            raise CalibrationError("a stage observation needs the crop it was seen on")
        try:
            target = float(obs["gdd_target"])
        except (KeyError, TypeError, ValueError) as exc:
            raise CalibrationError(f"{crop}: needs the gdd_target the stage was expected at") from exc
        if not 1 <= target <= 20_000:
            raise CalibrationError(f"{crop}: gdd_target {target:g} is outside any real crop's range")
        set_out_raw = obs.get("set_out")
        if not set_out_raw:
            raise CalibrationError(f"{crop}: needs the set_out date the count runs from")
        try:
            set_out = date.fromisoformat(str(set_out_raw))
        except ValueError as exc:
            raise CalibrationError(f"{crop}: set_out must be YYYY-MM-DD") from exc
        if set_out > observed_on:
            raise CalibrationError(f"{crop}: it cannot have been observed before it was set out")
        out.update({"crop": crop, "gdd_target": target, "set_out": set_out,
                    "stage": str(obs.get("stage") or "stage").strip()[:80]})

    return out


def heat_bias_from_stage(
    observed_gdd: float,
    expected_gdd: float,
) -> float | None:
    """How far this ground ran from the model, as a fraction.

    Positive means the ground reached the stage having accumulated MORE heat
    than expected — the model was crediting it with too little, or the
    published target is low for this variety here.
    """
    if expected_gdd <= 0:
        return None
    return (observed_gdd - expected_gdd) / expected_gdd


def summarize(values: list[float], cap: float) -> dict[str, Any] | None:
    """Median bias plus its spread, and whether it is safe to apply.

    The median, not the mean: one mis-entered date should move the answer by
    one rank, not drag the whole correction with it.
    """
    clean = [v for v in values if v is not None and abs(v) <= cap]
    rejected = len(values) - len(clean)
    if not clean:
        return None

    median = statistics.median(clean)
    spread = (max(clean) - min(clean)) if len(clean) > 1 else 0.0
    applicable = len(clean) >= MIN_FOR_CORRECTION

    return {
        "median": round(median, 4),
        "min": round(min(clean), 4),
        "max": round(max(clean), 4),
        "spread": round(spread, 4),
        "n": len(clean),
        "rejected_as_implausible": rejected,
        "applicable": applicable,
        "why_not": None if applicable else (
            f"Only {len(clean)} usable observation"
            f"{'s' if len(clean) != 1 else ''} — {MIN_FOR_CORRECTION} are needed before a "
            "correction is applied. Until then this is a record, not a model change."
        ),
    }


def confidence(n: int, spread: float, cap: float) -> str:
    """A word for how much weight the correction can carry.

    Deliberately a word and not a percentage: the honest uncertainty here is
    not something a handful of field reports can quantify, and a number would
    imply otherwise.
    """
    if n < MIN_FOR_CORRECTION:
        return "provisional"
    if n >= 8 and spread <= cap * 0.3:
        return "settled"
    if n >= 5 and spread <= cap * 0.6:
        return "firming"
    return "early"
