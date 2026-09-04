"""Winter chill — what this ground banked while the tree was dormant.

A fruit tree does not answer to a heat target. It answers to two things the
season gives it, and the first is COLD: a deciduous fruit tree will not break
dormancy properly until it has spent enough hours in the cold, and a cultivar
short of its chill delivers straggling bloom, poor fruit set, or nothing at
all. "Needs 800 chill hours" is printed on the nursery tag; this module says
what the ground actually delivered against it.

**The requirement is the caller's; the delivery is this ground's.** Chill
requirements vary by cultivar — Honeycrisp and Granny Smith differ by hundreds
of hours — which is exactly why the number comes from the tag and not from
here, the same arrangement `gdd_target` has in `crops`.

Hours, not days, because hours are the unit the grower is holding. The record
carries a daily maximum and minimum rather than an hourly series, so the day is
modelled as a sine between its two bounds and the time below a threshold falls
out analytically. That is the standard approximation, it costs no extra upstream
call, and it is exact at the three points anyone would check by hand.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

import math
import statistics
from datetime import date
from typing import Any

#: Hours at or below 45 °F, with NO lower bound — the Weinberger model, which
#: is the one the figures on nursery tags were derived from.
#:
#: A floor at freezing is tempting and would be wrong here. Later models (Utah,
#: Dynamic) do discount very cold hours, and under a 32-45 °F band a Vermont
#: January banks nothing at all — which would report a short chill on ground
#: that grows apples commercially. Measuring with a different yardstick than
#: the requirement was calibrated against is exactly the fault the dormancy
#: window below exists to avoid, so the model matches the tag.
CHILL_HIGH_F = 45.0

#: 1 November to 15 February — the window the published chill-hour figures were
#: derived against.
#:
#: This is narrower than the dormant period actually is, and that is the point.
#: Accumulating over a wider window would bank more hours against a requirement
#: calibrated to a narrower one, and report a tree comfortable where it is not —
#: the same class of quiet mismatch as reading a base-40 threshold off a base-50
#: curve. Stated in every answer so it can be argued with.
DORMANCY_START = (11, 1)
DORMANCY_END = (2, 15)

HOURS_PER_DAY = 24.0


def hours_below(tmax_f: float, tmin_f: float, threshold_f: float) -> float:
    """How many hours of one day were spent below ``threshold_f``.

    The day is modelled as a sine swinging between its two bounds. For a
    threshold at ``k`` of the way up the amplitude, the fraction of a full
    cycle below it is ``(π + 2·asin k) / 2π`` — which is 0 at the minimum,
    a half day at the midpoint, and the whole day at the maximum.
    """
    if tmax_f <= tmin_f:
        # A flat day carries no swing to integrate — it is wholly one side.
        return HOURS_PER_DAY if tmin_f < threshold_f else 0.0

    amplitude = (tmax_f - tmin_f) / 2.0
    midpoint = (tmax_f + tmin_f) / 2.0
    k = (threshold_f - midpoint) / amplitude

    if k >= 1.0:
        return HOURS_PER_DAY
    if k <= -1.0:
        return 0.0
    return HOURS_PER_DAY * (math.pi + 2.0 * math.asin(k)) / (2.0 * math.pi)


def daily_chill(
    tmax_f: float,
    tmin_f: float,
    high_f: float = CHILL_HIGH_F,
    low_f: float | None = None,
) -> float:
    """Chill hours banked in one day.

    ``low_f`` is offered for a caller who genuinely wants a banded model and
    knows their requirement was calibrated the same way. It defaults to absent,
    because the figure on the tag was not.
    """
    hours = hours_below(tmax_f, tmin_f, high_f)
    if low_f is not None:
        hours -= hours_below(tmax_f, tmin_f, low_f)
    return max(hours, 0.0)


def in_dormancy(d: date) -> bool:
    """Whether a date falls inside the accumulation window.

    The window crosses the year boundary, so this is a month/day test rather
    than a range — November and December belong to the winter that ENDS the
    following February.
    """
    md = (d.month, d.day)
    return md >= DORMANCY_START or md <= DORMANCY_END


def dormancy_ending(d: date) -> int:
    """Which winter a date belongs to, named by the year the winter ends in.

    November 2025 and February 2026 are the same winter; calling it "2026"
    matches how a grower says it and keeps the two halves together when the
    record is grouped.
    """
    return d.year + 1 if (d.month, d.day) >= DORMANCY_START else d.year


def banked(
    dates: list[str],
    tmax: list[float | None],
    tmin: list[float | None],
) -> list[dict[str, Any]]:
    """Chill hours per winter across a daily record.

    Grouped by the winter each day belongs to rather than by calendar year,
    and driven entirely by the dates the record returned — never by index
    arithmetic, because the feeds do not all agree on how many days a year has.
    Daymet drops 31 December in leap years, which would silently shift every
    slice taken by offset.

    A winter that the record covers only partly is still reported, with the
    days it had, so a caller can decide whether to trust it rather than being
    handed a short season dressed as a whole one.
    """
    by_winter: dict[int, dict[str, Any]] = {}

    for i, iso in enumerate(dates):
        try:
            d = date.fromisoformat(iso)
        except ValueError:
            continue
        if not in_dormancy(d):
            continue

        hi = tmax[i] if i < len(tmax) else None
        lo = tmin[i] if i < len(tmin) else None

        w = by_winter.setdefault(
            dormancy_ending(d),
            {"winter": dormancy_ending(d), "hours": 0.0, "days": 0, "gaps": 0,
             "from": iso, "to": iso},
        )
        w["to"] = max(w["to"], iso)
        w["from"] = min(w["from"], iso)

        if hi is None or lo is None:
            # A day the record could not report banks nothing. Counted, so a
            # thin winter is visible rather than merely low.
            w["gaps"] += 1
            continue
        w["hours"] += daily_chill(hi, lo)
        w["days"] += 1

    out = [{**w, "hours": round(w["hours"], 1)} for w in by_winter.values()]
    out.sort(key=lambda w: w["winter"])
    return out


#: A winter with fewer days than this is a fragment of the record, not a
#: season. The window is 107 days long; two thirds of it is the least that can
#: stand for the whole without flattering a block that has no cold in it.
MIN_WINTER_DAYS = 70


def summarize(winters: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The record's chill, as a grower would plan against it.

    Median rather than mean, and the LOWEST winter alongside it, because those
    support different decisions — the median is what to plant for and the
    lowest is what a marginal cultivar will actually be tested by. The same
    split `frost.summarize_frost_dates` makes between median and earliest.
    """
    whole = [w for w in winters if w["days"] >= MIN_WINTER_DAYS]
    if not whole:
        return None

    hours = [w["hours"] for w in whole]
    return {
        "median_hours": round(statistics.median(hours), 1),
        "lowest_hours": round(min(hours), 1),
        "highest_hours": round(max(hours), 1),
        "most_recent_hours": round(whole[-1]["hours"], 1),
        "most_recent_winter": whole[-1]["winter"],
        "winters_on_record": len(whole),
        "window": f"{DORMANCY_START[1]} Nov – {DORMANCY_END[1]} Feb",
        "model": f"hours at or below {CHILL_HIGH_F:g} °F",
    }


def winters_meeting(winters: list[dict[str, Any]], needed_hours: float) -> int:
    """How many whole winters on record delivered the requirement.

    The count is the answer, not the median. "Met in nine winters of ten" and
    "met in five" are different propositions for the same median, and it is the
    frequency a grower is actually deciding against — the framing
    `suitability` already uses for whether a crop finishes.
    """
    return sum(
        1 for w in winters
        if w["days"] >= MIN_WINTER_DAYS and w["hours"] >= needed_hours
    )
