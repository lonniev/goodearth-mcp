"""Crop timing — heat to target, and whether it finishes.

A planting is a crop, a piece of ground, and a date it went out. From those and
the region's heat, two questions follow that a grower asks constantly:

* **Where is it?** How much of its heat requirement has accumulated, and when
  does it reach the target at the season's recent rate.
* **Does it make it?** Whether that projected date lands before frost, and by
  how much it misses if not.

The second question is the one that changes a decision in August: a succession
that will not finish outside is a bed that should go to something else *now*,
while there is still time to use it.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

# A projection is only as good as the rate behind it. Two weeks smooths a cold
# snap without letting June's heat speak for September.
RATE_WINDOW_DAYS = 14

# Beyond this the straight-line carry stops meaning anything — the season's
# rate is falling, and pretending otherwise promises a date that cannot happen.
MAX_PROJECTION_DAYS = 120


class CropError(ValueError):
    """A planting cannot be evaluated as described."""


def validate_planting(planting: Any) -> dict[str, Any]:
    """Check a planting from an AI agent or a form. Treated as adversarial."""
    if not isinstance(planting, dict):
        raise CropError("planting must be an object with crop, gdd_target and set_out")

    name = str(planting.get("crop") or planting.get("name") or "").strip()
    if not name:
        raise CropError("planting needs a crop name")

    # A heat target is optional, for the same reason a set-out date is. A
    # grower recording "columbine grows here" is stating a fact about their
    # ground and has no degree-day figure for it — perennials mostly do not
    # have one they care about. Requiring the number forces a fabricated zero,
    # which then fails this very range check and takes the whole ledger with
    # it. Absent is absent; a target that IS given still has to be plausible.
    raw_target = planting.get("gdd_target")
    target: float | None = None
    if raw_target not in (None, ""):
        try:
            target = float(raw_target)
        except (TypeError, ValueError) as exc:
            raise CropError(f"{name}: gdd_target must be a number of growing degree days") from exc
        if not 1 <= target <= 20_000:
            raise CropError(f"{name}: gdd_target of {target:g} is outside any real crop's range")

    base = planting.get("base_temp")
    base_f = float(base) if isinstance(base, (int, float)) else None
    if base_f is not None and not 20.0 <= base_f <= 80.0:
        raise CropError(f"{name}: base_temp must be between 20 and 80 °F — Good Earth works in Fahrenheit")

    set_out_raw = planting.get("set_out") or planting.get("set_out_date")

    # A planting without a set-out date is still a planting. "Potatoes grow
    # here, and I do not remember when they went in" is a true statement about
    # the ground, and the record should be able to hold it — the alternative is
    # a placeholder date, which is a lie that then propagates into every GDD
    # answer and every calibration drawn from it. Such a row carries no dates,
    # so nothing downstream can count from it; it is presence, not progress.
    if not set_out_raw or target is None:
        # Say WHICH field is absent, here, once. Callers used to infer it from
        # ``set_out is None`` — but this branch nulls the set-out whenever
        # EITHER field is missing, so a grower who gave a date and no heat
        # target was told "no set-out recorded", which is simply untrue, and
        # the branch meant to report a missing target could never run.
        missing = [
            *(["set_out"] if not set_out_raw else []),
            *(["gdd_target"] if target is None else []),
        ]
        return {"crop": name, "gdd_target": target, "set_out": None,
                "base_temp_f": base_f, "presence_only": True,
                "missing": missing}
    try:
        set_out = date.fromisoformat(str(set_out_raw))
    except ValueError as exc:
        raise CropError(f"{name}: set_out must be YYYY-MM-DD, got {set_out_raw!r}") from exc

    return {"crop": name, "gdd_target": target, "set_out": set_out, "base_temp_f": base_f}


def accumulated_since(
    dates: list[str],
    cumulative: list[float],
    set_out: date,
) -> tuple[float, int] | None:
    """Heat accumulated since the planting went out, and how many days that is.

    The season curve counts from January 1; a planting counts from the day it
    was set out. Subtracting the accumulation at set-out re-bases one to the
    other rather than re-fetching the season.
    """
    if not dates or len(dates) != len(cumulative):
        return None
    iso = set_out.isoformat()
    start_idx: int | None = None
    for i, d in enumerate(dates):
        if d >= iso:
            start_idx = i
            break
    if start_idx is None:
        return None  # set out after the record ends — nothing accumulated yet
    base = cumulative[start_idx]
    return (round(cumulative[-1] - base, 1), len(dates) - start_idx)


def recent_rate(cumulative: list[float], window: int = RATE_WINDOW_DAYS) -> float:
    """Average GDD per day over the last ``window`` days of the record."""
    if len(cumulative) < 2:
        return 0.0
    span = min(window, len(cumulative) - 1)
    return max((cumulative[-1] - cumulative[-1 - span]) / span, 0.0)


def project_target_date(
    accumulated: float,
    target: float,
    rate: float,
    today: date,
) -> date | None:
    """When the planting reaches its target, carrying the recent rate forward.

    ``None`` when the rate is zero (nothing is accumulating, so no date is
    honest) or when the answer lies past the projection horizon.
    """
    if accumulated >= target:
        return None  # already there — the caller reports it as past target
    if rate <= 0:
        return None
    days = (target - accumulated) / rate
    if days > MAX_PROJECTION_DAYS:
        return None
    return today + timedelta(days=round(days))


def status(
    planting: dict[str, Any],
    dates: list[str],
    cumulative: list[float],
    today: date,
) -> dict[str, Any]:
    """Where one planting stands, and when it gets where it is going."""
    acc = accumulated_since(dates, cumulative, planting["set_out"])
    if acc is None:
        return {
            "crop": planting["crop"],
            "set_out": planting["set_out"].isoformat(),
            "gdd_target": planting["gdd_target"],
            "state": "not_yet_planted",
            "note": "Set-out date is after the season record — nothing accumulated yet.",
        }

    accumulated, days_in = acc
    target = planting["gdd_target"]
    rate = recent_rate(cumulative)
    projected = project_target_date(accumulated, target, rate, today)
    reached = accumulated >= target

    return {
        "crop": planting["crop"],
        "set_out": planting["set_out"].isoformat(),
        "days_since_set_out": days_in,
        "gdd_target": target,
        "gdd_accumulated": accumulated,
        "gdd_remaining": round(max(target - accumulated, 0.0), 1),
        "progress": round(min(accumulated / target, 1.0), 3) if target else 0.0,
        "recent_rate_gdd_per_day": round(rate, 2),
        "projected_date": projected.isoformat() if projected else None,
        "state": "past_target" if reached else ("on_pace" if projected else "stalled"),
        "note": (
            "Past target." if reached
            else "Projected at the last two weeks' rate — not a forecast."
            if projected
            else "No usable rate, or the target is beyond the projection horizon."
        ),
    }


def finish_before_frost(
    crop_status: dict[str, Any],
    median_frost: str | None,
    earliest_frost: str | None,
) -> dict[str, Any]:
    """Whether the planting reaches its target before frost takes it.

    Answered against BOTH the median and the earliest frost on record, because
    they support different decisions: the median is what to plan around, the
    earliest is what to hedge against.
    """
    if crop_status.get("state") == "past_target":
        return {"verdict": "finished", "note": "Already past target — frost is not the question."}

    projected = crop_status.get("projected_date")
    if not projected or not median_frost:
        return {
            "verdict": "unknown",
            "note": "Needs both a projected date and a frost record to answer.",
        }

    proj = date.fromisoformat(projected)
    median = date.fromisoformat(median_frost)
    margin = (median - proj).days

    verdict = "finishes" if margin >= 0 else "wont_finish"
    at_risk = False
    if earliest_frost:
        at_risk = proj > date.fromisoformat(earliest_frost)

    rate = crop_status.get("recent_rate_gdd_per_day") or 0
    shortfall = round(abs(margin) * rate, 1) if margin < 0 and rate else None

    return {
        "verdict": verdict,
        "projected_date": projected,
        "median_frost": median_frost,
        "margin_days": margin,
        "at_risk_of_early_frost": at_risk,
        "gdd_shortfall": shortfall,
        "note": (
            f"Reaches target about {margin} days before the median first frost."
            if margin >= 0 else
            f"Projected {abs(margin)} days past the median first frost"
            + (f" — roughly {shortfall:g} GDD short." if shortfall else ".")
        ),
    }
