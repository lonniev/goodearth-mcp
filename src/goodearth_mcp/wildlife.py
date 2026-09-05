"""The wildlife calendar — the other creatures working the same season.

A farm is not only its crops. Robins arrive, woodchucks wake, squirrels start
caching, geese go over. Growers have always read the year by these, and they
are not folklore: the same drivers that time a crop time the animals — heat
accumulation, day length, and the calendar the sun keeps.

**This module computes; it does not claim natural history.** Like the pest
models, the thresholds come from the caller. A robin's arrival correlating with
the 37 °F isotherm is a documented relationship, but the number that is right
for a particular valley belongs to a local naturalist, an extension bulletin,
or the grower's own twenty years of noticing — not to this file. Shipping a
date as settled fact would be inventing something a grower plans around.

It also carries the livestock, which run on a clock of their own. A ewe's
gestation does not care what the season is doing; it is a count of days from
the day she was bred. Lambing, calving, farrowing, a clutch's hatch date and a
pullet's point of lay are all intervals, and putting them on the same calendar
as the robins is how a farm's year actually reads.

Four ways an event can be timed, because animals do not all run on one clock:

* **heat** — a degree-day threshold, like a crop or a pest. Emergence and
  insect-driven events work this way.
* **daylight** — a photoperiod threshold. Migration is largely triggered by day
  length, which is why it is far steadier year to year than temperature is.
* **interval** — a fixed count of days from a date the grower supplies. Every
  husbandry event is this: gestation, incubation, days to point of lay.
* **calendar** — a date window from the grower's own record, for the ones with
  no clean driver.

The honest part is that heat is computed from this ground's own numbers,
daylight from astronomy, and the other two are arithmetic on what the grower
told us. None of it is asserted.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from goodearth_mcp import almanac

#: The Fahrenheit range any temperature in this module must fall inside. Named
#: once because the trigger check and the base-temperature check are the same
#: claim about the same scale.
MIN_BASE_F = 20.0
MAX_BASE_F = 80.0

DRIVERS = {"heat", "daylight", "interval", "calendar", "condition"}

#: What a `condition` trigger may ask about. Deliberately short: each of these
#: is a field the block's own daily record already carries, so a trigger is
#: always answerable from data this service has rather than from a promise.
TRIGGER_KEYS = {"after", "min_night_f", "min_day_f", "wet"}


class WildlifeError(ValueError):
    """An event cannot be evaluated as described."""


def validate_event(ev: Any) -> dict[str, Any]:
    """Check one caller-supplied wildlife event."""
    if not isinstance(ev, dict):
        raise WildlifeError("each event must be an object with species, event and a driver")

    species = str(ev.get("species") or "").strip()
    if not species:
        raise WildlifeError("an event needs a species")
    label = str(ev.get("event") or "").strip()
    if not label:
        # A roster entry is not an event. "The great blue heron is an ally
        # here" is the grower's own judgment about a creature on their ground,
        # and it names no date — the same shape as a watched pest with no
        # stages, or a crop that grows here with no set-out. It is recorded,
        # and it dates nothing.
        return {"species": species, "event": "", "driver": "roster",
                "emoji": str(ev.get("emoji") or "").strip(),
                "role": str(ev.get("role") or "").strip(),
                "roster_only": True}

    driver = str(ev.get("driver") or "").strip().lower()
    if driver not in DRIVERS:
        raise WildlifeError(
            f"{species}: driver must be one of {', '.join(sorted(DRIVERS))}, got {driver!r}"
        )

    out: dict[str, Any] = {
        "species": species, "event": label, "driver": driver,
        "note": str(ev.get("note") or "").strip()[:300],
        "emoji": str(ev.get("emoji") or "").strip()[:4] or None,
    }

    if driver == "heat":
        try:
            g = float(ev["gdd"])
        except (KeyError, TypeError, ValueError) as exc:
            raise WildlifeError(f"{species}: a heat-driven event needs a gdd threshold") from exc
        if not 0 < g <= 20_000:
            raise WildlifeError(f"{species}: gdd of {g:g} is outside any plausible range")
        base = ev.get("base_temp", 50.0)
        try:
            base_f = float(base)
        except (TypeError, ValueError) as exc:
            raise WildlifeError(f"{species}: base_temp must be a number in °F") from exc
        if not MIN_BASE_F <= base_f <= MAX_BASE_F:
            raise WildlifeError(f"{species}: base_temp must be 20–80 °F — Good Earth works in Fahrenheit")
        out.update({"gdd": g, "base_temp_f": base_f})

    elif driver == "daylight":
        try:
            h = float(ev["daylight_hours"])
        except (KeyError, TypeError, ValueError) as exc:
            raise WildlifeError(
                f"{species}: a daylight-driven event needs daylight_hours"
            ) from exc
        if not 0 < h < 24:
            raise WildlifeError(f"{species}: daylight_hours must be between 0 and 24, got {h:g}")
        rising = ev.get("rising")
        out.update({"daylight_hours": h, "rising": bool(rising) if rising is not None else True})

    elif driver == "interval":
        try:
            days = int(ev["days"])
        except (KeyError, TypeError, ValueError) as exc:
            raise WildlifeError(
                f"{species}: an interval event needs `days` — the count from the start date"
            ) from exc
        if not 0 < days <= 1000:
            raise WildlifeError(f"{species}: {days} days is outside any plausible interval")
        raw = ev.get("from") or ev.get("from_date")
        if not raw:
            raise WildlifeError(
                f"{species}: needs `from` — the date it counts from "
                "(bred, set, hatched)"
            )
        try:
            frm = date.fromisoformat(str(raw))
        except ValueError as exc:
            raise WildlifeError(f"{species}: `from` must be YYYY-MM-DD, got {raw!r}") from exc
        out.update({"days": days, "from": frm})

    elif driver == "condition":
        # A grower-defined event: real, unmodelled, and dated by what the
        # weather does rather than by a date or a heat sum.
        #
        # The salamanders' "Big Night" is the case that asked for this — the
        # first mild wet night after the ground thaws, which no catalogue
        # contains and no degree-day total finds. The definition is stored in
        # the RECORD, so it belongs to the grower and re-dates itself every
        # season, rather than being remembered by whichever agent last helped.
        out.update({"trigger": validate_trigger(species, ev.get("trigger"))})

    else:  # calendar
        raw = ev.get("typical_on")
        if not raw:
            raise WildlifeError(f"{species}: a calendar event needs typical_on (MM-DD)")
        try:
            month, day = (int(x) for x in str(raw).split("-")[-2:])
            date(2000, month, day)
        except (ValueError, TypeError) as exc:
            raise WildlifeError(f"{species}: typical_on must be MM-DD, got {raw!r}") from exc
        out.update({"month": month, "day": day})

    return out


def validate_trigger(species: str, raw: Any) -> dict[str, Any]:
    """Check one grower-defined trigger. Tool input is adversarial."""
    if not isinstance(raw, dict):
        raise WildlifeError(
            f"{species}: a condition event needs a `trigger` object, e.g. "
            '{"after": "03-01", "min_night_f": 40, "wet": true}'
        )

    unknown = sorted(set(raw) - TRIGGER_KEYS)
    if unknown:
        # Named rather than ignored. A trigger silently missing the condition
        # that was the whole point would date the wrong night and look right.
        raise WildlifeError(
            f"{species}: a trigger cannot ask about {', '.join(unknown)} — "
            f"only {', '.join(sorted(TRIGGER_KEYS))}"
        )

    out: dict[str, Any] = {}

    after = raw.get("after")
    if after not in (None, ""):
        try:
            month, day = (int(x) for x in str(after).split("-")[-2:])
            date(2000, month, day)
        except (ValueError, TypeError) as exc:
            raise WildlifeError(
                f"{species}: a trigger's `after` must be MM-DD, got {after!r}"
            ) from exc
        out["after"] = f"{month:02d}-{day:02d}"

    for key in ("min_night_f", "min_day_f"):
        v = raw.get(key)
        if v in (None, ""):
            continue
        try:
            f = float(v)
        except (TypeError, ValueError) as exc:
            raise WildlifeError(f"{species}: a trigger's {key} must be a number in °F") from exc
        if not MIN_BASE_F <= f <= MAX_BASE_F:
            raise WildlifeError(
                f"{species}: {key} must be {MIN_BASE_F:.0f}–{MAX_BASE_F:.0f} °F — "
                "Good Earth works in Fahrenheit"
            )
        out[key] = f

    if raw.get("wet") is not None:
        out["wet"] = bool(raw["wet"])

    # A trigger with only a date is a calendar event wearing a costume, and it
    # would report the day after `after` every year whatever the weather did.
    if not (set(out) - {"after"}):
        raise WildlifeError(
            f"{species}: a trigger needs something the weather decides — "
            "min_night_f, min_day_f or wet. A date alone is a calendar event."
        )
    return out


def _says(trigger: dict[str, Any]) -> str:
    """The trigger in the grower's own terms, for the row it dates."""
    parts = []
    if "min_night_f" in trigger:
        parts.append(f"night at or above {trigger['min_night_f']:g}°F")
    if "min_day_f" in trigger:
        parts.append(f"day at or above {trigger['min_day_f']:g}°F")
    if trigger.get("wet"):
        parts.append("rain")
    said = " and ".join(parts) or "a condition"
    return f"{said}, after {trigger['after']}" if "after" in trigger else said


def condition_event(
    ev: dict[str, Any],
    dates: list[str],
    tmax: list[float | None],
    tmin: list[float | None],
    precip: list[float | None],
    today: date,
) -> dict[str, Any]:
    """The first day this ground met the grower's own conditions.

    Answered from the season record, so it re-dates itself every year rather
    than repeating what it said last time. A season that has not met them yet
    reports that plainly — there is no projecting a wet night, and inventing
    one would be worse than saying it has not happened.
    """
    trigger = ev["trigger"]
    said = _says(trigger)
    after = trigger.get("after")

    for i, iso in enumerate(dates):
        if after and iso[5:] < after:
            continue
        night = tmin[i] if i < len(tmin) else None
        day = tmax[i] if i < len(tmax) else None
        rain = precip[i] if i < len(precip) else None

        if "min_night_f" in trigger and (night is None or night < trigger["min_night_f"]):
            continue
        if "min_day_f" in trigger and (day is None or day < trigger["min_day_f"]):
            continue
        # A day the record could not report is not a dry day. Skipping it is
        # the honest reading; calling it dry would move the date later and
        # calling it wet would move it earlier.
        if trigger.get("wet") and (rain is None or rain <= 0):
            continue

        return {
            "driver": "condition", "threshold": said,
            "reached_on": iso, "projected_date": None,
            "note": f"The first day this ground met it: {said}. Your own definition.",
        }

    return {
        "driver": "condition", "threshold": said,
        "reached_on": None, "projected_date": None,
        "note": (
            f"Not met yet this season — {said}. There is no forecasting a wet "
            "night, so this waits for the day rather than guessing at it."
        ),
    }


def heat_event(
    ev: dict[str, Any],
    dates: list[str],
    cumulative: list[float],
    rate: float,
    today: date,
) -> dict[str, Any]:
    """When a degree-day threshold is reached on this ground."""
    reached_on = None
    for d, g in zip(dates, cumulative, strict=False):
        if g >= ev["gdd"]:
            reached_on = d
            break
    accumulated = cumulative[-1] if cumulative else 0.0

    projected = None
    if reached_on is None and rate > 0:
        days = (ev["gdd"] - accumulated) / rate
        if 0 < days <= 180:
            projected = (today + timedelta(days=round(days))).isoformat()

    return {
        "driver": "heat",
        "threshold": f"{ev['gdd']:g} GDD base {ev['base_temp_f']:g}°F",
        "reached_on": reached_on,
        "projected_date": projected,
        "gdd_accumulated": round(accumulated, 1),
        "gdd_remaining": None if reached_on else round(max(ev["gdd"] - accumulated, 0.0), 1),
    }


def daylight_event(
    ev: dict[str, Any],
    dates: list[str],
    daylight_hours: list[float | None],
    lat: float | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """When day length crosses a photoperiod threshold.

    Direction matters: 13 hours on the way up is April and on the way down is
    August, and an animal cued by lengthening days ignores the second one
    entirely. Migration runs on this clock, which is why it barely moves
    between a warm year and a cold one.
    """
    want = ev["daylight_hours"]
    rising = ev["rising"]
    crossed = None
    prev: float | None = None
    for d, h in zip(dates, daylight_hours, strict=False):
        if h is None:
            continue
        if prev is not None:
            up = h > prev
            if up == rising and ((prev < want <= h) or (prev > want >= h)):
                crossed = d
                break
        prev = h
    # A crossing the record has not reached is still exactly knowable — day
    # length is astronomy. Reporting nothing for a future date would be a limit
    # of the plumbing, not of what can be known.
    projected = None
    if crossed is None and lat is not None and today is not None:
        projected = almanac.next_daylight_crossing(lat, today, want, rising)

    return {
        "driver": "daylight",
        "threshold": f"{want:g} h and {'lengthening' if rising else 'shortening'}",
        "reached_on": crossed,
        "projected_date": projected,
        "note": "Day length is astronomy — this date barely moves year to year.",
    }


def interval_event(ev: dict[str, Any], today: date) -> dict[str, Any]:
    """A fixed count of days from a date the grower supplied.

    Weather-independent by nature: a ewe bred on the first of October lambs
    about 147 days later whatever the winter does. Reported with a window
    rather than a single day, because gestation and incubation both vary by a
    few days and a date presented to the hour would be a false precision that
    gets someone up at 3am for nothing.
    """
    due = ev["from"] + timedelta(days=ev["days"])
    spread = max(1, round(ev["days"] * 0.02))   # about ±2%, the usual variation
    return {
        "driver": "interval",
        "threshold": f"{ev['days']} days from {ev['from'].isoformat()}",
        "reached_on": due.isoformat() if due <= today else None,
        "projected_date": None if due <= today else due.isoformat(),
        "window": {
            "from": (due - timedelta(days=spread)).isoformat(),
            "to": (due + timedelta(days=spread)).isoformat(),
        },
        "note": (
            f"Due about {due.isoformat()}, give or take {spread} day"
            f"{'s' if spread != 1 else ''} — gestation and incubation both vary."
        ),
    }


def calendar_event(ev: dict[str, Any], today: date) -> dict[str, Any]:
    """A date the grower recorded, expressed in the current year."""
    try:
        when = date(today.year, ev["month"], ev["day"])
    except ValueError:
        return {"driver": "calendar", "threshold": "—", "reached_on": None,
                "projected_date": None}
    return {
        "driver": "calendar",
        "threshold": f"{when.strftime('%b %-d')} typically",
        "reached_on": when.isoformat() if when <= today else None,
        "projected_date": None if when <= today else when.isoformat(),
        "note": "From your own record — not computed from this season.",
    }


def upcoming(rows: list[dict[str, Any]], today: date, within_days: int = 21) -> list[dict[str, Any]]:
    """Events due soon, soonest first — the ones worth watching for."""
    out = []
    for r in rows:
        d = r.get("projected_date")
        if not d:
            continue
        try:
            days = (date.fromisoformat(d) - today).days
        except ValueError:
            continue
        if 0 <= days <= within_days:
            out.append({**r, "days_away": days})
    return sorted(out, key=lambda r: r["days_away"])
