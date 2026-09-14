"""When to put it in the ground.

Heat requirement answers whether a crop *can* finish here. It says nothing
about when to start, and starting is the decision a grower actually makes with
a seed packet in hand in February.

Three dates, and they are three different questions:

* **Start seed indoors.** For a transplanted crop, counted back from the day
  it can go out. Get this wrong and you have leggy seedlings in a window in
  March, or nothing ready in June.
* **Out.** The earliest the ground and the frost record allow. A tender crop
  waits for the last spring frost; a hardy one can use the shoulder before it;
  a direct-sown one waits for the soil, which lags the air by weeks.
* **Latest.** The last day a sowing still has enough heat left to finish
  before the first fall frost. This is the one that decides whether an August
  succession is worth the seed.

And, when asked, the **successions** between them: a sowing every so many days
from the first to the last, each with the day it typically finishes here and
how much room that leaves before the frost.

All three come from this block's own record. The crop's requirements —
hardiness, germination soil temperature, weeks indoors — come from the caller,
as everywhere else here.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from goodearth_mcp import gdd

# How far before the last frost a hardy crop can reasonably go out. Hardy means
# it survives a light frost, not that it ignores winter.
HARDY_HEAD_START_DAYS = 14

# How often a succession may be sown. Under three days is one sowing twice;
# over sixty is a second crop, not a succession.
MIN_SUCCESSION_DAYS, MAX_SUCCESSION_DAYS = 3, 60

# A sowing that has not banked its heat within a year never will.
YEAR_DAYS = 366


class PlantingError(ValueError):
    """A crop's planting requirements cannot be read."""


def validate(c: Any) -> dict[str, Any]:
    """Check one crop's planting requirements."""
    if not isinstance(c, dict):
        raise PlantingError("each crop must be an object with crop and gdd_target")

    name = str(c.get("crop") or c.get("name") or "").strip()
    if not name:
        raise PlantingError("a crop needs a name")

    try:
        target = float(c["gdd_target"])
    except (KeyError, TypeError, ValueError) as exc:
        raise PlantingError(f"{name}: gdd_target must be a number") from exc
    if not 1 <= target <= 20_000:
        raise PlantingError(f"{name}: gdd_target {target:g} is outside any real crop's range")

    base = c.get("base_temp", 50.0)
    try:
        base_f = float(base)
    except (TypeError, ValueError) as exc:
        raise PlantingError(f"{name}: base_temp must be a number in °F") from exc
    if not 20.0 <= base_f <= 80.0:
        raise PlantingError(f"{name}: base_temp must be 20–80 °F — Good Earth works in Fahrenheit")

    soil = c.get("min_soil_f")
    min_soil_f = None
    if soil is not None:
        try:
            min_soil_f = float(soil)
        except (TypeError, ValueError) as exc:
            raise PlantingError(f"{name}: min_soil_f must be a number in °F") from exc
        if not 32.0 <= min_soil_f <= 95.0:
            raise PlantingError(f"{name}: min_soil_f of {min_soil_f:g} is outside any real range")

    weeks = c.get("start_indoors_weeks")
    indoors = None
    if weeks is not None:
        try:
            indoors = float(weeks)
        except (TypeError, ValueError) as exc:
            raise PlantingError(f"{name}: start_indoors_weeks must be a number") from exc
        if not 0 < indoors <= 20:
            raise PlantingError(f"{name}: {indoors:g} weeks indoors is outside any real range")

    every = c.get("succession_days")
    succession = None
    if every is not None:
        if isinstance(every, bool) or not isinstance(every, int | float) or every != int(every):
            raise PlantingError(f"{name}: succession_days must be a whole number of days")
        succession = int(every)
        if not MIN_SUCCESSION_DAYS <= succession <= MAX_SUCCESSION_DAYS:
            raise PlantingError(
                f"{name}: sow a succession every {MIN_SUCCESSION_DAYS}–{MAX_SUCCESSION_DAYS} days"
            )

    return {
        "crop": name,
        "gdd_target": target,
        "base_temp_f": base_f,
        "frost_hardy": bool(c.get("frost_hardy", False)),
        "direct_sow": bool(c.get("direct_sow", False)),
        "min_soil_f": min_soil_f,
        "start_indoors_weeks": indoors,
        "succession_days": succession,
        "emoji": str(c.get("emoji") or "").strip()[:4] or None,
    }


def plan_year(first_fall_median: date | None, today: date) -> int:
    """The season to plan for.

    Once this year's first fall frost has typically come, what a grower plans
    next is the coming spring. In November the window answered with the
    season gone by — "start onions indoors Feb 2", a February already past —
    and offered no successions at all.
    """
    if first_fall_median and today > first_fall_median:
        return today.year + 1
    return today.year


def earliest_out(
    crop: dict[str, Any],
    last_frost: date | None,
    soil_ready: date | None,
) -> tuple[date | None, str]:
    """The first day this crop can reasonably go out, and why that day.

    Two constraints, and the later one wins: a seed that germinates at 60 °F
    does not care that the frost has stopped, and a tender transplant does not
    care that the soil is warm.
    """
    reasons: list[tuple[date, str]] = []

    if last_frost:
        if crop["frost_hardy"]:
            reasons.append((
                last_frost - timedelta(days=HARDY_HEAD_START_DAYS),
                f"hardy — about {HARDY_HEAD_START_DAYS} days before the last frost",
            ))
        else:
            tender_why = (
                "tender — after the last spring frost (the MEDIAN: half of "
                "seasons frost later than this, so it is a coin toss, not a "
                "green light)"
            )
            reasons.append((last_frost, tender_why))

    if soil_ready and crop["min_soil_f"] is not None:
        reasons.append((soil_ready, f"soil reaches {crop['min_soil_f']:g} °F"))

    if not reasons:
        return None, "no frost or soil record to judge from"

    when, why = max(reasons, key=lambda r: r[0])
    if len(reasons) > 1:
        why += " (the later of frost and soil)"
    return when, why


def finish_date(out_on: date, target: float, clim: gdd.Climate) -> date | None:
    """The day a sowing typically banks its heat target here.

    A median year, not a forecast. None when it does not within a year.
    """
    if not clim:
        return None
    total, day = 0.0, out_on
    for _ in range(YEAR_DAYS):
        total += gdd.typical_heat(clim, day)
        if total >= target:
            return day
        day += timedelta(days=1)
    return None


def latest_out(
    crop: dict[str, Any],
    first_frost: date | None,
    clim: gdd.Climate,
) -> tuple[date | None, int | None]:
    """The last day a sowing still finishes before the first fall frost.

    Walked back from the day before the median first frost through this
    ground's typical heat for each calendar day, so it is the same arithmetic
    as `finish_date` run backwards: a sowing on this day finishes before the
    frost, and one a day later does not.
    """
    if not first_frost or not clim:
        return None, None
    total, day = 0.0, first_frost - timedelta(days=1)
    for _ in range(YEAR_DAYS):
        total += gdd.typical_heat(clim, day)
        if total >= crop["gdd_target"]:
            return day, (first_frost - day).days
        day -= timedelta(days=1)
    return None, None


def successions(
    crop: dict[str, Any],
    first: date | None,
    last: date | None,
    clim: gdd.Climate,
    first_frost: date | None,
    earliest_frost: date | None,
    today: date,
) -> list[dict[str, Any]]:
    """A sowing every `succession_days`, from the first day it can go out —
    or today, once that has passed — to the last that still finishes.

    Each carries its own typical finish, the days that leaves before the
    median first frost, and whether it lands after the EARLIEST frost on
    record: the late ones are the bet, and the grower should see which.
    """
    every = crop.get("succession_days")
    if not every or not first or not last:
        return []
    out: list[dict[str, Any]] = []
    weeks = crop.get("start_indoors_weeks")
    on, n = max(first, today), 1
    while on <= last:
        fin = finish_date(on, crop["gdd_target"], clim)
        margin = (first_frost - fin).days if fin and first_frost else None
        out.append({
            "n": n,
            "out": on.isoformat(),
            "start_seed_indoors": (
                (on - timedelta(days=round(weeks * 7))).isoformat() if weeks else None
            ),
            "finish": fin.isoformat() if fin else None,
            "margin_days": margin,
            "verdict": "unknown" if margin is None else ("finishes" if margin > 0 else "wont_finish"),
            "at_risk_of_early_frost": bool(fin and earliest_frost and fin >= earliest_frost),
        })
        on += timedelta(days=every)
        n += 1
    return out


def assess(
    crop: dict[str, Any],
    last_frost: date | None,
    first_frost: date | None,
    soil_ready: date | None,
    clim: gdd.Climate,
    today: date,
    earliest_frost: date | None = None,
) -> dict[str, Any]:
    """The three dates for one crop, with the reasoning attached."""
    out_on, why = earliest_out(crop, last_frost, soil_ready)
    last_on, days_needed = latest_out(crop, first_frost, clim)

    start_indoors = None
    if out_on and crop["start_indoors_weeks"]:
        start_indoors = out_on - timedelta(days=round(crop["start_indoors_weeks"] * 7))

    window_days = None
    if out_on and last_on:
        window_days = (last_on - out_on).days

    if window_days is None:
        # A frost record, a table of this ground's heat, and still no last
        # sowing: not even a whole year of heat here reaches the target. That
        # is an answer — it will not fit — not a gap in the record.
        cannot_finish = bool(out_on and first_frost and clim and last_on is None)
        state = "will_not_fit" if cannot_finish else "unknown"
    elif window_days < 0:
        state = "will_not_fit"
    elif window_days < 14:
        state = "narrow"
    else:
        state = "open"

    # When the window is negative the "latest" date lands before the earliest,
    # sometimes in a previous year. That is arithmetic, not advice, so it is
    # withheld and the state carries the answer instead.
    show_latest = last_on if (last_on and out_on and last_on >= out_on) else None

    extra: dict[str, Any] = {}
    if crop.get("succession_days"):
        extra["successions"] = successions(
            crop, out_on, show_latest, clim, first_frost, earliest_frost, today,
        )

    return {
        "crop": crop["crop"],
        "emoji": crop["emoji"],
        "start_seed_indoors": start_indoors.isoformat() if start_indoors else None,
        "earliest_out": out_on.isoformat() if out_on else None,
        "earliest_reason": why,
        "latest_out": show_latest.isoformat() if show_latest else None,
        "days_to_finish": days_needed,
        "window_days": window_days,
        "state": state,
        "sow_now": bool(out_on and last_on and out_on <= today <= last_on),
        "note": _note(state, window_days, crop, start_indoors, today),
        **extra,
    }


def _note(
    state: str, window: int | None, crop: dict[str, Any],
    start_indoors: date | None, today: date,
) -> str:
    if state == "will_not_fit":
        return (
            f"The window closes before it opens here — {crop['crop']} needs more "
            "season than this ground gives outdoors."
        )
    if state == "narrow":
        return f"Only about {window} days of sowing window. Miss it and the crop misses frost."
    if state == "open":
        base = f"About {window} days of sowing window."
        if start_indoors and start_indoors > today:
            base += f" Seed goes in indoors around {start_indoors.strftime('%b %-d')}."
        elif start_indoors and start_indoors <= today:
            base += " Indoor sowing date has passed for this season."
        return base
    return "Not enough record to judge a window."


def sort_key(row: dict[str, Any]) -> tuple[int, str]:
    """Soonest actionable first — what to do next is the useful ordering."""
    rank = {"open": 0, "narrow": 1, "will_not_fit": 2, "unknown": 3}
    return (rank.get(row["state"], 9), row.get("earliest_out") or "9999")
