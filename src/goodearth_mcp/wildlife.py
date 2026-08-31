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

Three ways an event can be timed, because animals do not all run on one clock:

* **heat** — a degree-day threshold, like a crop or a pest. Emergence and
  insect-driven events work this way.
* **daylight** — a photoperiod threshold. Migration is largely triggered by day
  length, which is why it is far steadier year to year than temperature is.
* **calendar** — a date window from the grower's own record, for the ones with
  no clean driver.

The honest part is that the first two are computed exactly from this ground's
own numbers, and the third is simply what the grower wrote down.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from goodearth_mcp import almanac

MAX_EVENTS = 24
DRIVERS = {"heat", "daylight", "calendar"}


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
        raise WildlifeError(f"{species}: needs an event name, like 'first arrival'")

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
        if not 20.0 <= base_f <= 80.0:
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
