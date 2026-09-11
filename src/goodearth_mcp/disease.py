"""Wetness-driven disease models — the conditions, never the treatment.

Five published extension models, each a small table and a classifier over the
hours `wetness.py` estimated. They answer one question: did this ground spend
long enough wet, at the right temperature, for an infection to have happened.

WHAT THIS MODULE WILL NOT DO. It reports wet hours, which criteria were met, and
a risk class. It names no product, no rate and no interval. Pesticide
registration is jurisdiction-specific and a label rate is law; that conversation
belongs to an extension service whose word counts where this service's does not.
The same sentence rides out in every answer's `note`, so an agent reading the
data gets it too.

THE TABLES ARE THE PUBLISHED ONES, ROUNDED. Mills, Wallin and Hutton are decades
of other people's field work, and this module is an arithmetic layer over them,
not a source for them. NEWA (Cornell) is the reference implementation; where a
figure here and a figure there disagree, theirs is right. Every model states its
own citation in `MODELS` so the grower can go and check.
"""

from __future__ import annotations

from typing import Any

from goodearth_mcp import wetness
from goodearth_mcp.wetness import Hour


class DiseaseError(ValueError):
    """The model, as asked for, cannot be run."""


def f_to_c(f: float) -> float:
    return (f - 32.0) * 5.0 / 9.0


# ── Model catalogue ──────────────────────────────────────────────────────
#
# `key` is what a stored pest row references as `model`. `crops` is advisory —
# it names what the model was developed against, so a grower pointing it at
# something else can see they are extrapolating.

MODELS: dict[str, dict[str, Any]] = {
    "hutton": {
        "name": "Hutton criteria",
        "disease": "potato and tomato late blight",
        "crops": ["potato", "tomato"],
        "citation": "Dancey et al., the Hutton Criteria (2016), successor to the Smith Period",
        "asks": "two consecutive days, each with a minimum above 10 C and at least six hours at 90% humidity",
    },
    "mills": {
        "name": "modified Mills",
        "disease": "apple scab",
        "crops": ["apple", "crabapple"],
        "citation": "Mills (1944) as revised by Jones; NEWA is the reference implementation",
        "asks": "hours of leaf wetness at the wet period's mean temperature",
    },
    "wallin": {
        "name": "Wallin severity values",
        "disease": "early blight",
        "crops": ["potato", "tomato"],
        "citation": "Wallin (1962), severity values accrued per wet period",
        "asks": "daily severity from wet hours at temperature, summed across the season",
    },
    "botrytis": {
        "name": "botrytis wetness",
        "disease": "grey mould",
        "crops": ["calendula", "cut flowers", "strawberry", "grape"],
        "citation": "continuous wetness-duration form used across the extension literature",
        "asks": "an unbroken stretch of wet hours long enough for the temperature it happened at",
    },
    "powdery_mildew": {
        "name": "powdery mildew conduciveness",
        "disease": "powdery mildew",
        "crops": ["cucurbit", "grape", "calendula", "rose"],
        "citation": "the standard inverse case — humid air, no free water",
        "asks": "hours of high humidity WITHOUT rain, which a wetness counter reads backwards",
    },
}


def validate_model(row: Any) -> dict[str, Any]:
    """Normalise one requested disease row, or say what is wrong with it.

    Mirrors `pests.validate_model`: a fixed shape out, and a refusal that
    teaches the shape rather than merely rejecting it.
    """
    if not isinstance(row, dict):
        raise DiseaseError("a disease row must be an object")

    name = str(row.get("disease") or row.get("pest") or row.get("name") or "").strip()
    key = str(row.get("model") or "").strip().lower().replace("-", "_")

    if not key and name:
        # A bare name is a reasonable thing to send; resolve it if exactly one
        # model claims it, and say so plainly when several or none do.
        hits = [k for k, m in MODELS.items() if name.lower() in (k, m["name"].lower(), m["disease"].lower())]
        if len(hits) == 1:
            key = hits[0]

    if not key:
        raise DiseaseError(
            f"{name or 'this row'}: name a model with model=\"...\" — one of "
            f"{', '.join(sorted(MODELS))}. Each is a published one; Good Earth "
            "runs them against your ground and does not invent thresholds."
        )
    if key not in MODELS:
        raise DiseaseError(
            f"{name or key}: {key!r} is not a model this service runs. "
            f"Use one of {', '.join(sorted(MODELS))}."
        )
    return {"model": key, "disease": name or MODELS[key]["disease"]}


# ── Hutton — late blight ─────────────────────────────────────────────────

HUTTON_MIN_C = 10.0
HUTTON_HUMID_HOURS = 6


def _hutton_days(hours: list[Hour]) -> list[dict[str, Any]]:
    out = []
    for day, rows in wetness.by_day(hours).items():
        temps = [h.temp_f for h in rows if h.temp_f is not None]
        humid = sum(1 for h in rows if h.humid)
        low = min(temps) if temps else None
        warm = low is not None and f_to_c(low) >= HUTTON_MIN_C
        out.append({
            "date": day,
            "min_temp_f": round(low, 1) if low is not None else None,
            "humid_hours": humid,
            "warm_enough": warm,
            "humid_enough": humid >= HUTTON_HUMID_HOURS,
            "qualifies": bool(warm and humid >= HUTTON_HUMID_HOURS),
            # A day the feed only half filled cannot qualify, and should not be
            # reported as a day that failed on its merits.
            "hours_read": sum(1 for h in rows if h.known),
        })
    return out


def hutton(hours: list[Hour]) -> dict[str, Any]:
    days = _hutton_days(hours)

    # One period per WEATHER EVENT, not per overlapping pair of days.
    #
    # Hutton asks for two consecutive qualifying days, so a five-day wet spell
    # contains four such pairs — and counting them gave Frogdale "13 periods"
    # for what were really six spells. A grower reading that is being told the
    # season was twice as bad as it was.
    periods = []
    run: list[str] = []
    for d in [*days, {"date": "", "qualifies": False}]:
        if d["qualifies"]:
            run.append(d["date"])
            continue
        if len(run) >= 2:
            periods.append({"from": run[0], "to": run[-1], "days": len(run)})
        run = []

    qualifying = [d["date"] for d in days if d["qualifies"]]
    if periods:
        why = f"{len(periods)} full criteria period{'s' if len(periods) != 1 else ''} in the record."
    elif qualifying:
        why = (
            f"{len(qualifying)} day{'s' if len(qualifying) != 1 else ''} met both criteria "
            f"({', '.join(qualifying)}), but no two fell together — Hutton asks for "
            "two CONSECUTIVE days and this record has none."
        )
    else:
        why = "No day in the record met both criteria."

    return {
        "criteria": {
            "min_temp_c": HUTTON_MIN_C,
            "humid_hours": HUTTON_HUMID_HOURS,
            "consecutive_days": 2,
        },
        "days": days,
        "qualifying_days": qualifying,
        "periods": periods,
        "risk": "criteria met" if periods else "criteria not met",
        "qualifying": periods,
        "explain": why,
    }


# ── Mills — apple scab ───────────────────────────────────────────────────
#
# Wet hours needed at the wet period's mean temperature. The published table is
# per-degree at its cold end and flat across the middle; this is it, rounded to
# whole hours, with the bands the literature actually prints.

MILLS_TABLE: tuple[tuple[float, float, int, int, int], ...] = (
    # (low_f, high_f, light, moderate, severe)
    (33.0, 41.9, 48, 72, 96),
    (42.0, 42.9, 30, 40, 60),
    (43.0, 43.9, 25, 36, 53),
    (44.0, 44.9, 22, 33, 45),
    (45.0, 45.9, 20, 30, 40),
    (46.0, 46.9, 19, 28, 35),
    (47.0, 47.9, 17, 24, 30),
    (48.0, 48.9, 15, 23, 30),
    (49.0, 49.9, 15, 22, 30),
    (50.0, 50.9, 14, 21, 28),
    (51.0, 51.9, 14, 21, 28),
    (52.0, 52.9, 13, 20, 27),
    (53.0, 53.9, 12, 18, 26),
    (54.0, 54.9, 12, 17, 24),
    (55.0, 55.9, 11, 16, 24),
    (56.0, 56.9, 11, 15, 22),
    (57.0, 57.9, 11, 14, 22),
    (58.0, 58.9, 10, 13, 21),
    (59.0, 59.9, 10, 13, 20),
    (60.0, 60.9, 9, 12, 19),
    (61.0, 75.0, 9, 12, 18),
    (75.1, 76.0, 10, 12, 19),
    (76.1, 77.0, 11, 14, 21),
    (77.1, 78.0, 13, 17, 26),
)

#: A short dry spell under cloud does not reset a scab infection, and the
#: published model is run with an interruption allowance. Two hours.
MILLS_BRIDGE = 2


def mills_requirement(mean_f: float | None) -> tuple[int, int, int] | None:
    if mean_f is None:
        return None
    for lo, hi, light, moderate, severe in MILLS_TABLE:
        if lo <= mean_f <= hi:
            return light, moderate, severe
    return None


def mills(hours: list[Hour]) -> dict[str, Any]:
    rs = wetness.runs(hours, bridge=MILLS_BRIDGE)
    periods = []
    for r in rs:
        need = mills_requirement(r.mean_temp_f)
        if need is None:
            # Outside the table's temperature range is not an infection that
            # failed — it is a question the model does not answer.
            periods.append({
                **r.as_dict(),
                "class": None,
                "explain": "the wet period's mean temperature is outside the published table",
            })
            continue
        light, moderate, severe = need
        klass = (
            "severe" if r.hours >= severe
            else "moderate" if r.hours >= moderate
            else "light" if r.hours >= light
            else None
        )
        periods.append({
            **r.as_dict(),
            "class": klass,
            "needed_hours": {"light": light, "moderate": moderate, "severe": severe},
            "explain": (
                f"{r.hours} wet hours at a mean {r.mean_temp_f:.0f} F — "
                + (f"a {klass} infection period." if klass
                   else f"{light} were needed for the lightest class.")
            ),
        })

    infections = [p for p in periods if p.get("class")]
    worst = max((p["class"] for p in infections), key=["light", "moderate", "severe"].index, default=None)
    return {
        "criteria": {"table": "modified Mills", "bridged_dry_hours_allowed": MILLS_BRIDGE},
        "periods": periods,
        "infection_periods": infections,
        "risk": worst or "no infection period",
        "qualifying": infections,
        "explain": (
            f"{len(infections)} infection period{'s' if len(infections) != 1 else ''} in the record"
            + (f", the worst {worst}." if worst else ".")
            if infections else
            f"{len(periods)} wet period{'s' if len(periods) != 1 else ''}, none long enough at its temperature."
        ),
    }


# ── Wallin — early blight ────────────────────────────────────────────────
#
# Severity value per wet period from its hours and mean temperature, summed.
# Bands in Celsius, as published.

WALLIN_BANDS: tuple[tuple[float, float, tuple[int, int, int, int]], ...] = (
    # (low_c, high_c, (hours for SV1, SV2, SV3, SV4))
    (7.2, 11.6, (16, 23, 28, 33)),
    (11.7, 15.0, (13, 19, 22, 26)),
    (15.1, 20.0, (11, 16, 19, 22)),
    (20.1, 25.0, (9, 13, 16, 19)),
    (25.1, 26.6, (9, 13, 16, 19)),
)

#: The accumulation the literature marks as the point a grower starts making
#: decisions. Reported as a CLASS BOUNDARY, not as an instruction — what to do
#: at 18 is between the grower and their extension service.
WALLIN_DECISION_SV = 18


def wallin_severity(hours_wet: int, mean_f: float | None) -> int:
    if mean_f is None:
        return 0
    c = f_to_c(mean_f)
    for lo, hi, steps in WALLIN_BANDS:
        if lo <= c <= hi:
            return sum(1 for need in steps if hours_wet >= need)
    return 0


def wallin(hours: list[Hour]) -> dict[str, Any]:
    rs = wetness.runs(hours)
    periods = []
    total = 0
    for r in rs:
        sv = wallin_severity(r.hours, r.mean_temp_f)
        total += sv
        if sv:
            periods.append({**r.as_dict(), "severity_value": sv})
    return {
        "criteria": {"table": "Wallin severity values", "decision_point_sv": WALLIN_DECISION_SV},
        "severity_total": total,
        "periods": periods,
        "risk": (
            "at the published decision point" if total >= WALLIN_DECISION_SV
            else "accruing" if total else "none accrued"
        ),
        # Wallin is CUMULATIVE — the season's accrual is its own fact, and a
        # separate one from whether anything is happening this week.
        "at_decision_point": total >= WALLIN_DECISION_SV,
        "qualifying": periods,
        "explain": (
            f"{total} severity value{'s' if total != 1 else ''} accrued across "
            f"{len(periods)} wet period{'s' if len(periods) != 1 else ''}. The literature "
            f"marks {WALLIN_DECISION_SV} as the point growers begin deciding; what to decide "
            "is your extension service's to say."
        ),
    }


# ── Botrytis ─────────────────────────────────────────────────────────────
#
# One unbroken wet stretch, long enough for the temperature it happened at.

BOTRYTIS_BANDS: tuple[tuple[float, float, int], ...] = (
    # (low_f, high_f, unbroken wet hours needed)
    (41.0, 50.0, 18),
    (50.1, 59.0, 12),
    (59.1, 68.0, 8),
    (68.1, 77.0, 6),
    (77.1, 86.0, 12),
)


def botrytis_requirement(mean_f: float | None) -> int | None:
    if mean_f is None:
        return None
    for lo, hi, need in BOTRYTIS_BANDS:
        if lo <= mean_f <= hi:
            return need
    return None


def botrytis(hours: list[Hour]) -> dict[str, Any]:
    rs = wetness.runs(hours)
    periods = []
    for r in rs:
        need = botrytis_requirement(r.mean_temp_f)
        if need is None:
            periods.append({**r.as_dict(), "qualifies": False,
                            "explain": "too cold or too warm for the published bands"})
            continue
        periods.append({
            **r.as_dict(),
            "needed_hours": need,
            "qualifies": r.hours >= need,
            "explain": (
                f"{r.hours} unbroken wet hours at a mean {r.mean_temp_f:.0f} F; "
                f"{need} are needed at that temperature."
            ),
        })
    qualifying = [p for p in periods if p.get("qualifies")]
    longest_run = wetness.longest(rs)
    return {
        "criteria": {"table": "unbroken wet hours by temperature band"},
        "periods": periods,
        "infection_periods": qualifying,
        "longest_wet_run": longest_run.as_dict() if longest_run else None,
        "risk": "conditions met" if qualifying else "conditions not met",
        "qualifying": qualifying,
        "explain": (
            f"{len(qualifying)} qualifying wet period{'s' if len(qualifying) != 1 else ''} in the record."
            if qualifying else
            (f"The longest unbroken wet stretch was {longest_run.hours} hours at a mean "
             f"{longest_run.mean_temp_f:.0f} F, short of what that temperature needs."
             if longest_run and longest_run.mean_temp_f is not None else
             "Nothing in the record stayed wet long enough to count.")
        ),
    }


# ── Powdery mildew — the inverse case ────────────────────────────────────

PM_RH_LOW, PM_RH_HIGH = 70.0, 90.0
PM_TEMP_LOW_F, PM_TEMP_HIGH_F = 68.0, 81.0
#: Free water on the leaf SUPPRESSES this one. A conducive spell ends when it
#: rains, which is the opposite of every other model here.
PM_CONDUCIVE_HOURS = 6


def _pm_conducive(h: Hour) -> bool:
    return (
        h.rh_pct is not None and PM_RH_LOW <= h.rh_pct < PM_RH_HIGH
        and h.temp_f is not None and PM_TEMP_LOW_F <= h.temp_f <= PM_TEMP_HIGH_F
        and not h.rained
    )


def powdery_mildew(hours: list[Hour]) -> dict[str, Any]:
    rs = wetness.runs(hours, wet=_pm_conducive)
    spells = [r.as_dict() for r in rs if r.hours >= PM_CONDUCIVE_HOURS]
    washed = sum(1 for h in hours if h.rained)
    return {
        "criteria": {
            "humidity_pct": [PM_RH_LOW, PM_RH_HIGH],
            "temperature_f": [PM_TEMP_LOW_F, PM_TEMP_HIGH_F],
            "free_water": "suppresses",
            "conducive_hours": PM_CONDUCIVE_HOURS,
        },
        "spells": spells,
        "risk": "conducive" if spells else "not conducive",
        "qualifying": spells,
        "explain": (
            f"{len(spells)} conducive spell{'s' if len(spells) != 1 else ''} — humid air without "
            f"free water. {washed} hour{'s' if washed != 1 else ''} of rain in the record worked "
            "against it. This is the model a wetness counter gets backwards: the hours the "
            "others count are the hours this one loses."
        ),
    }


#: How long a qualifying period stays the answer to "what about now".
#:
#: A DISPLAY window, not a biological claim: a lesion does not stop developing
#: on a fourteenth day. It is here because "risk" had come to mean "at some
#: point since January", which on any Vermont season is nearly always true and
#: therefore says nothing — five models out of five reported risk on a farm
#: having its driest year in a decade.
RECENT_DAYS = 14


def _began(period: dict[str, Any]) -> str:
    return str(period.get("from") or period.get("start") or "")


def timeline(
    qualifying: list[dict[str, Any]], forecast_from: str | None, today: str | None,
) -> dict[str, Any]:
    """The last qualifying period and the next one, and whether either is now.

    The two questions a grower actually has. A season total answers neither:
    "twenty infection periods" on the 11th of September says nothing about
    whether to cut flowers this afternoon.
    """
    dated = sorted((p for p in qualifying if _began(p)), key=_began)
    cut = (forecast_from or "")[:10]
    past = [p for p in dated if not cut or _began(p)[:10] < cut]
    ahead = [p for p in dated if cut and _began(p)[:10] >= cut]

    last, nxt = (past[-1] if past else None), (ahead[0] if ahead else None)
    recent = False
    if last and today:
        from datetime import date as _d
        try:
            recent = (_d.fromisoformat(today) - _d.fromisoformat(_began(last)[:10])).days <= RECENT_DAYS
        except ValueError:
            recent = False

    return {
        "season_count": len(dated),
        "last_period": last,
        "next_period": nxt,
        "recent": recent,
        # What "risk" means: something happened lately, or the forecast says
        # something is about to. Not "this ground has ever been wet".
        "at_risk": bool(recent or nxt),
        "recent_window_days": RECENT_DAYS,
    }


RUNNERS = {
    "hutton": hutton,
    "mills": mills,
    "wallin": wallin,
    "botrytis": botrytis,
    "powdery_mildew": powdery_mildew,
}


NOTE = (
    "Wetness is ESTIMATED from modelled humidity, never measured. These are "
    "published extension models run against your ground; Good Earth does not "
    "publish plant pathology and never recommends a treatment — registration is "
    "jurisdiction-specific and a label rate is law. Take any decision to your "
    "extension service, whose word counts where this service's does not."
)


def assess(
    model: dict[str, Any],
    hours: list[Hour],
    forecast_from: str | None = None,
    today: str | None = None,
) -> dict[str, Any]:
    """Run one validated model over the hours, whatever they turned out to be."""
    key = model["model"]
    spec = MODELS[key]
    if not hours:
        return {
            "model": key,
            "disease": model["disease"],
            "about": spec,
            "risk": "not computed",
            "at_risk": False,
            "explain": "no hourly record came back for this ground, so nothing was counted.",
        }
    out = RUNNERS[key](hours)
    when = timeline(out.pop("qualifying", []), forecast_from, today)
    return {
        "model": key,
        "disease": model["disease"],
        "about": spec,
        **out,
        **when,
        "now": _now_line(out, when),
    }


def _now_line(out: dict[str, Any], when: dict[str, Any]) -> str:
    """What is true TODAY, in one sentence, ahead of the season's arithmetic."""
    if when["next_period"]:
        return f"The forecast implies a qualifying period beginning {_began(when['next_period'])[:10]}."
    if when["recent"]:
        return f"A qualifying period began {_began(when['last_period'])[:10]}, inside the last {RECENT_DAYS} days."
    if when["last_period"]:
        return (
            f"Nothing qualifying now or in the forecast. The most recent was "
            f"{_began(when['last_period'])[:10]}, and there have been "
            f"{when['season_count']} this season."
        )
    return "Nothing qualifying this season, and nothing in the forecast."
