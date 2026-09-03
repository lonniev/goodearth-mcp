"""Pest thresholds — when to walk the rows.

A pest's life cycle runs on the same degree-day clock the crop does, which is
why a threshold expressed in GDD travels between seasons where a calendar date
does not. Extension services publish these models: a base temperature, a
biofix (the event the count starts from — often first sustained trap catch,
sometimes simply Jan 1), and the accumulation at which a stage arrives.

**This module computes; it does not claim entomology.** The threshold and base
temperature come from the caller, because the authoritative numbers belong to
the grower's own extension service and vary by region and biotype. Shipping a
hardcoded threshold as though it were settled would be inventing a fact on a
page a grower spends money and pesticide against.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

MAX_THRESHOLDS = 12


#: Models a grower may reference rather than restate. Kept deliberately short:
#: each entry is a published source this service already reads for the caller's
#: own coordinates, so a name here is a promise that dates can be resolved.
PUBLISHED_MODELS = {"usa-npn"}


class PestError(ValueError):
    """A pest model cannot be evaluated as described."""


def validate_model(model: Any) -> dict[str, Any]:
    """Check one caller-supplied pest model. Tool input is adversarial."""
    if not isinstance(model, dict):
        raise PestError("each pest model must be an object with pest, base_temp and stages")

    pest = str(model.get("pest") or model.get("name") or "").strip()
    if not pest:
        raise PestError("a pest model needs a name")

    base = model.get("base_temp", 50.0)
    try:
        base_f = float(base)
    except (TypeError, ValueError) as exc:
        raise PestError(f"{pest}: base_temp must be a number in °F") from exc
    if not 20.0 <= base_f <= 80.0:
        raise PestError(f"{pest}: base_temp must be between 20 and 80 °F — Good Earth works in Fahrenheit")

    biofix_raw = model.get("biofix")
    biofix: date | None = None
    if biofix_raw:
        try:
            biofix = date.fromisoformat(str(biofix_raw))
        except ValueError as exc:
            raise PestError(f"{pest}: biofix must be YYYY-MM-DD, got {biofix_raw!r}") from exc

    stages_raw = model.get("stages")

    # A grower may REFERENCE a published model instead of restating it.
    #
    # USA-NPN publishes pheno-forecast layers, and this service already reads
    # them for the caller's own ground — pest_catalog renders their dates on
    # screen. So "watch the Japanese beetle by the published model" needs no
    # degree-day figures from the caller at all, and asking for them invites
    # exactly the confidently-wrong numbers review_roster warns about: an agent
    # can only get those from training data.
    #
    # This is citing a source, not publishing entomology. The dates come from
    # NPN, for this block, and they are labelled with where they came from.
    # It also means the model RE-RESOLVES every season, where stages copied in
    # once would freeze whatever the forecast said the day they were pasted.
    reference = str(model.get("model") or "").strip().lower()
    if reference and not stages_raw:
        if reference not in PUBLISHED_MODELS:
            raise PestError(
                f"{pest}: {reference!r} is not a published model. "
                f"Use one of {', '.join(sorted(PUBLISHED_MODELS))}, give your own "
                "stages, or set watch=true to note it without dating it."
            )
        return {"pest": pest, "base_temp_f": base_f, "biofix": biofix,
                "stages": [], "model": reference}

    # A watch list is not a model. A grower watches voles, slugs and wasps —
    # creatures with no degree-day stages, watched all season — and demanding
    # thresholds for them invites exactly the invented numbers review_roster
    # warns about. `watch: true` records the vigilance and dates nothing.
    watching = bool(model.get("watch")) and not stages_raw
    if watching:
        return {"pest": pest, "base_temp_f": base_f, "biofix": biofix,
                "stages": [], "watch": True}

    if not isinstance(stages_raw, list) or not stages_raw:
        raise PestError(
            f"{pest}: needs a non-empty stages list, model=\"usa-npn\" to use the "
            "published forecast for your ground, or watch=true to note it as "
            "something you keep an eye on without dating it"
        )
    if len(stages_raw) > MAX_THRESHOLDS:
        raise PestError(f"{pest}: {len(stages_raw)} stages is more than one model should carry")

    stages: list[dict[str, Any]] = []
    for s in stages_raw:
        if not isinstance(s, dict):
            raise PestError(f"{pest}: each stage must be an object with stage and gdd")
        label = str(s.get("stage") or s.get("name") or "").strip()
        if not label:
            raise PestError(f"{pest}: a stage needs a name")
        try:
            g = float(s["gdd"])
        except (KeyError, TypeError, ValueError) as exc:
            raise PestError(f"{pest} / {label}: gdd must be a number") from exc
        if not 0 < g <= 20_000:
            raise PestError(f"{pest} / {label}: gdd of {g:g} is outside any real model's range")
        stages.append({"stage": label, "gdd": g})

    stages.sort(key=lambda s: s["gdd"])
    return {"pest": pest, "base_temp_f": base_f, "biofix": biofix, "stages": stages}


def accumulated_from_biofix(
    dates: list[str],
    cumulative: list[float],
    biofix: date | None,
) -> tuple[float, str] | None:
    """Heat since the biofix, and the date it counted from.

    With no biofix the count is the season's own — which is what many models
    that start from Jan 1 want.
    """
    if not dates or len(dates) != len(cumulative):
        return None
    if biofix is None:
        return (cumulative[-1], dates[0])
    iso = biofix.isoformat()
    for i, d in enumerate(dates):
        if d >= iso:
            return (round(cumulative[-1] - cumulative[i], 1), d)
    return None


def assess(
    model: dict[str, Any],
    dates: list[str],
    cumulative: list[float],
    rate: float,
) -> dict[str, Any]:
    """Which stages this pest has reached, and when the next one arrives."""
    acc = accumulated_from_biofix(dates, cumulative, model["biofix"])
    if acc is None:
        return {
            "pest": model["pest"],
            "state": "not_started",
            "note": "The biofix is after the season record — nothing accumulated yet.",
        }

    accumulated, counted_from = acc
    stages: list[dict[str, Any]] = []
    crossed_idx = -1

    for i, s in enumerate(model["stages"]):
        reached = accumulated >= s["gdd"]
        if reached:
            crossed_idx = i
        remaining = round(max(s["gdd"] - accumulated, 0.0), 1)
        projected = None
        if not reached and rate > 0:
            days = remaining / rate
            if days <= 120:
                projected = (date.fromisoformat(dates[-1]) + _days(days)).isoformat()
        stages.append({
            "stage": s["stage"],
            "gdd": s["gdd"],
            "reached": reached,
            "gdd_remaining": remaining if not reached else 0.0,
            "projected_date": projected,
        })

    next_stage = stages[crossed_idx + 1] if crossed_idx + 1 < len(stages) else None
    current = stages[crossed_idx]["stage"] if crossed_idx >= 0 else None

    return {
        "pest": model["pest"],
        "base_temp_f": model["base_temp_f"],
        "biofix": model["biofix"].isoformat() if model["biofix"] else None,
        "counted_from": counted_from,
        "gdd_accumulated": accumulated,
        "current_stage": current,
        "next_stage": next_stage,
        "stages": stages,
        "state": "active" if crossed_idx >= 0 else "before_first_stage",
        "note": (
            "Thresholds are the caller's own model. Confirm them against your "
            "local extension service — they vary by region and biotype."
        ),
    }


def _days(n: float) -> timedelta:
    return timedelta(days=round(n))


def scouting_priority(
    assessments: list[dict[str, Any]],
    today: date,
    within_days: int = 10,
) -> list[str]:
    """Which pests crossed a stage recently or cross one soon.

    This is the answer a grower acts on: not the whole table, but which few
    to go and look for this week.
    """
    out: list[str] = []
    for a in assessments:
        nxt = a.get("next_stage")
        if a.get("state") == "active" and (not nxt or not nxt.get("projected_date")):
            out.append(f"{a['pest']} — past {a.get('current_stage')}")
            continue
        if nxt and nxt.get("projected_date"):
            days = (date.fromisoformat(nxt["projected_date"]) - today).days
            if 0 <= days <= within_days:
                out.append(f"{a['pest']} — {nxt['stage']} in about {days} days")
    return out
