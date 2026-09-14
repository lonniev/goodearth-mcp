"""A tree's year on this ground: when spring arrived, and when the sap ran.

`perennial` answers the two questions asked before a tree goes in — will it
live here, will it fruit here. This answers the ones asked once it is in the
ground and the year is turning.

**Spring** is USA-NPN's Spring Index, dated for this block: first leaf, when
the growing season starts, and first bloom, when it begins to flower. Both
against their own thirty-year normal, because "spring is early" is a headline
and "leaf-out reached this block seven days before its normal" is an answer.

First bloom is also when the pollen starts. That is a restatement of what
bloom IS, not a pollen forecast — Good Earth has no pollen feed and does not
model one, and nothing here says what anyone should do about it.

**The sap run** is freeze and thaw, not warmth: sap moves when a night below
freezing is followed by a day above it, and it stops when nights stop
freezing. That is a count this ground's own record already answers.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

#: A sap day: the night freezes and the day thaws. Both halves are required —
#: a mild night or a day that stays frozen moves nothing.
SAP_NIGHT_MAX_F = 32.0
SAP_DAY_MIN_F = 40.0

#: The sap winter: from the first of December — sugarmakers tap early now, and
#: a December thaw runs sap — to mid-May, when the buds break. A freeze-thaw
#: pair in November is still not the start of a season. The window crosses the
#: new year, and a winter is named by the year it ends in. It was Jan 15 to
#: May 15 of the calendar year: a December run was never counted, and on Dec 20
#: the section reported the spring before.
SAP_SEARCH_FROM = (12, 1)
SAP_SEARCH_TO = (5, 15)

#: Before this, a quiet spell is a PAUSE — a hard January freeze — not the end
#: of the run. From April a quiet fortnight is the buds breaking.
SAP_QUIET_ENDS_FROM = (4, 1)

#: The run is over when this many days pass with no cycle — in practice when
#: nights stop freezing, and shortly after that the buds break and the sap
#: turns. A shorter gap would call every mild week the end of the season.
SAP_QUIET_DAYS = 10


def as_date(doy: float | None, year: int) -> str | None:
    """A day-of-year raster value as a calendar date.

    The Spring Index rasters carry fractional values where they are resampled,
    so this rounds rather than truncating — 101.33 is 11 April, not 10 April
    plus a third of a day nobody can act on.
    """
    if doy is None:
        return None
    n = round(float(doy))
    if not 1 <= n <= 366:
        return None
    return (date(year, 1, 1) + timedelta(days=n - 1)).isoformat()


def spring(index: dict[str, float | None], year: int) -> dict[str, Any]:
    """First leaf and first bloom for this ground, against their normals.

    The departure is a subtraction the reader can check, and it is stated in
    days because that is the unit a grower plans in. Negative is early.
    """
    out: dict[str, Any] = {}
    for stage, now_key, normal_key in (
        ("first_leaf", "first_leaf", "normal_leaf"),
        ("first_bloom", "first_bloom", "normal_bloom"),
    ):
        now = index.get(now_key)
        normal = index.get(normal_key)
        row: dict[str, Any] = {
            "on": as_date(now, year),
            "normally": as_date(normal, year),
        }
        if now is not None and normal is not None:
            row["days_from_normal"] = round(now - normal)
        out[stage] = row

    return out


def spring_note(sp: dict[str, Any]) -> str:
    """What the spring index says, said once."""
    leaf = sp.get("first_leaf") or {}
    if not leaf.get("on"):
        return "No spring index for this ground yet this season."

    d = leaf.get("days_from_normal")
    if d is None:
        return "Leaf-out is dated for this block; its normal is not."
    if d == 0:
        return "Leaf-out arrived on its thirty-year normal."
    return (
        f"Leaf-out arrived {abs(d)} day{'s' if abs(d) != 1 else ''} "
        f"{'early' if d < 0 else 'late'}."
    )


def _in_sap_window(d: date) -> bool:
    md = (d.month, d.day)
    return md >= SAP_SEARCH_FROM or md <= SAP_SEARCH_TO


def sap_winter(today: date) -> tuple[date, date]:
    """The sap winter in question: the one under way, or the one just past."""
    ends = today.year + 1 if (today.month, today.day) >= SAP_SEARCH_FROM else today.year
    return date(ends - 1, *SAP_SEARCH_FROM), date(ends, *SAP_SEARCH_TO)


def sap_days(
    dates: list[str],
    tmax: list[float | None],
    tmin: list[float | None],
) -> list[str]:
    """Every day this ground both froze and thawed, inside the sap window."""
    out: list[str] = []
    for i, iso in enumerate(dates):
        try:
            d = date.fromisoformat(iso)
        except ValueError:
            continue
        if not _in_sap_window(d):
            continue
        hi = tmax[i] if i < len(tmax) else None
        lo = tmin[i] if i < len(tmin) else None
        if hi is None or lo is None:
            continue
        if lo <= SAP_NIGHT_MAX_F and hi >= SAP_DAY_MIN_F:
            out.append(iso)
    return out


def sap_run(
    dates: list[str],
    tmax: list[float | None],
    tmin: list[float | None],
    today: date,
) -> dict[str, Any] | None:
    """This winter's sap run: when it started, how many days it has had, and
    whether it is running, paused or over.

    The winter runs Dec 1 to May 15 and is named by the year it ends in. Past
    May 15 the answer is the winter just gone, stated as over, with the day the
    next window opens — a sugarmaker asking in August is told the run is over
    rather than shown last spring's arithmetic dressed as now. None when the
    record does not reach the winter at all.
    """
    start, end = sap_winter(today)
    lo_iso, hi_iso = start.isoformat(), end.isoformat()
    idx = [i for i, iso in enumerate(dates) if lo_iso <= iso <= hi_iso]
    if not idx:
        return None

    winter = f"{start.year}–{str(end.year)[2:]}"
    window = f"{SAP_SEARCH_FROM[1]} Dec – {SAP_SEARCH_TO[1]} May"
    past = today > end
    days = sap_days(
        [dates[i] for i in idx],
        [tmax[i] if i < len(tmax) else None for i in idx],
        [tmin[i] if i < len(tmin) else None for i in idx],
    )
    if not days:
        # Inside the window with no cycle yet is a real answer; past it with
        # none is a winter this ground did not run.
        return {
            "state": "none_recorded" if past else "not_started",
            "cycles": 0,
            "winter": winter,
            "window": window,
            "note": (
                f"No freeze-and-thaw day recorded in the winter of {winter}." if past
                else f"The sap window opened on {start.strftime('%b %-d')}; no "
                     "freeze-and-thaw day yet this winter."
            ),
        }

    last = date.fromisoformat(days[-1])
    quiet = (today - last).days
    buds = (today.month, today.day) >= SAP_QUIET_ENDS_FROM and today.month < SAP_SEARCH_FROM[0]
    if past or (quiet >= SAP_QUIET_DAYS and buds):
        state = "over"
    elif quiet >= SAP_QUIET_DAYS:
        state = "paused"
    else:
        state = "running"

    return {
        "state": state,
        "started_on": days[0],
        "last_cycle_on": days[-1],
        "cycles": len(days),
        "days_since_last_cycle": quiet,
        "winter": winter,
        "window": window,
        **({"next_window_opens": date(today.year, *SAP_SEARCH_FROM).isoformat()} if past else {}),
        "note": (
            f"{len(days)} freeze-and-thaw day{'s' if len(days) != 1 else ''} "
            f"this winter ({winter}) from {days[0]}"
            + (f", last on {days[-1]}." if state == "over"
               else f"; none for {quiet} days — a cold spell, not the end." if state == "paused"
               else f"; the most recent was {days[-1]}.")
        ),
    }


def taps(plants: list[dict[str, Any]]) -> list[str]:
    """The saved plants the grower says they tap.

    This used to test whether a saved name contained "maple", "birch" or
    "walnut". That is wrong twice over. It read a Japanese maple in a front
    garden as a sugarbush, and it read nothing at all on a row saved as
    `Acer saccharum` — the binomial the rest of this service now runs on.

    It was also the wrong question. A sugar maple in a hedgerow is not tapped
    and a sugar maple in a sugarbush is, and no catalogue anywhere knows which
    of those a grower has. The one party who knows is the one with the buckets,
    so they say, and the sap section follows what they said.
    """
    return [
        str(p.get("crop") or p.get("tree") or p.get("name") or "")
        for p in plants
        if isinstance(p, dict) and p.get("taps") is True
        and (p.get("crop") or p.get("tree") or p.get("name"))
    ]
