"""Leaf wetness, estimated from the hours a weather feed will actually give you.

**Nothing here is measured.** A leaf wetness sensor is a plate in a field; what
this module has is a modelled hourly humidity at a grid cell. Every figure it
produces is an estimate, and the estimator names itself in `ESTIMATOR` so a
caller can publish what it did rather than a bare number.

Two things decide a fungal infection: how long the leaf stayed wet, and how warm
it was while it did. Degree days answer neither — a hot dry August accumulates
heat all month and grows no botrytis. So this counts hours, and the models in
`disease.py` read the hours.

THE THRESHOLD IS THE WHOLE DIFFICULTY. `RH >= 90` is a step function laid over a
continuous field, and a quarter of the hours in a typical Vermont fortnight sit
within five points of that line. Measured at Panton over 28 Aug - 6 Sep 2026, a
1.9 F difference in mean dew-point depression between two feeds moved the count
from 30 wet hours to 86. That is why `disease_window` pins its feed and why every
answer says which one spoke: the estimator is not the largest source of doubt
here, the grid cell is.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

#: An hour is HUMID when the modelled relative humidity reaches this. The
#: convention every extension implementation uses, and the one NEWA reports
#: against, so a figure from here is comparable to one from there.
WET_RH_PCT = 90.0

#: Rain in the hour wets the leaf whatever the humidity says. Below this it is
#: a trace that the next hour's air takes back.
WET_PRECIP_MM = 0.2

#: ...unless the air is thirsty. Rain falling into air this far from its dew
#: point evaporates off the leaf rather than sitting on it, so the hour is not
#: counted wet on the strength of a shower alone. 5.4 F is 3 C.
DRY_DEPRESSION_F = 5.4

ESTIMATOR: dict[str, Any] = {
    "name": "relative-humidity threshold with rain",
    "measured": False,
    "wet_when": (
        f"modelled relative humidity reaches {WET_RH_PCT:.0f}%, or rain over "
        f"{WET_PRECIP_MM} mm falls in the hour into air within "
        f"{DRY_DEPRESSION_F:.1f} F of its dew point"
    ),
    "why_estimated": (
        "leaf wetness is a sensor reading and no feed publishes it for arbitrary "
        "ground; this is the standard substitution, and it inherits the grid "
        "cell's humidity bias"
    ),
}


@dataclass(frozen=True)
class Hour:
    """One hour of the record, with the two verdicts the models ask for."""

    at: str
    temp_f: float | None
    rh_pct: float | None
    dew_f: float | None
    precip_mm: float | None

    @property
    def day(self) -> str:
        return self.at[:10]

    @property
    def depression_f(self) -> float | None:
        """How far the air sits from its dew point. Small means close to wet."""
        if self.temp_f is None or self.dew_f is None:
            return None
        return self.temp_f - self.dew_f

    @property
    def humid(self) -> bool:
        """RH at or above the threshold — the figure Hutton and Wallin count.

        Separate from `wet` on purpose. Hutton is written against relative
        humidity alone, and folding rain into it would quietly make this
        service's late-blight verdict disagree with every published one.
        """
        return self.rh_pct is not None and self.rh_pct >= WET_RH_PCT

    @property
    def rained(self) -> bool:
        return self.precip_mm is not None and self.precip_mm > WET_PRECIP_MM

    @property
    def wet(self) -> bool:
        """The leaf is estimated wet: humid, or rained on into unthirsty air."""
        if self.humid:
            return True
        if not self.rained:
            return False
        dep = self.depression_f
        return dep is None or dep <= DRY_DEPRESSION_F

    @property
    def known(self) -> bool:
        """Enough of the hour came back to judge it.

        An hour the feed did not fill is not a dry hour. Counting a gap as dry
        is how a run gets broken by missing data and an infection period
        disappears for a reason nobody can see.
        """
        return self.rh_pct is not None or self.precip_mm is not None


def read_hours(block: dict[str, Any]) -> list[Hour]:
    """Build the hour list from an Open-Meteo hourly block.

    Tolerant of short arrays: the feed occasionally returns one variable a few
    hours longer than the rest, and the shortest is the honest length.
    """
    times = [str(t) for t in (block.get("time") or [])]
    if not times:
        return []

    def col(name: str) -> list[float | None]:
        vals = block.get(name) or []
        out: list[float | None] = []
        for v in vals:
            out.append(float(v) if isinstance(v, (int, float)) else None)
        return out

    temp, rh = col("temperature_2m"), col("relative_humidity_2m")
    dew, rain = col("dew_point_2m"), col("precipitation")
    n = min(len(times), *(len(c) for c in (temp, rh, dew, rain))) if times else 0
    return [
        Hour(at=times[i], temp_f=temp[i], rh_pct=rh[i], dew_f=dew[i], precip_mm=rain[i])
        for i in range(n)
    ]


@dataclass(frozen=True)
class Run:
    """An unbroken stretch of wet hours, and how warm it was."""

    start: str
    end: str
    hours: int
    mean_temp_f: float | None
    #: Dry hours tolerated inside the run. Reported because a 14-hour run that
    #: bridged two dry hours is not the same evidence as one that did not.
    bridged: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "start": self.start,
            "end": self.end,
            "hours": self.hours,
            "mean_temp_f": round(self.mean_temp_f, 1) if self.mean_temp_f is not None else None,
            **({"bridged_dry_hours": self.bridged} if self.bridged else {}),
        }


def runs(hours: Iterable[Hour], bridge: int = 0, wet: Callable[[Hour], bool] | None = None) -> list[Run]:
    """Unbroken wet stretches, longest-lived first in the record's own order.

    `bridge` is how many consecutive dry hours a run survives. Zero is the
    strict reading; Mills allows a short interruption because a leaf that dries
    for an hour under cloud has not reset the infection. The model chooses, and
    the number it chose travels in the answer.

    `wet` overrides which hours count, so Hutton can ask for humidity alone
    while botrytis asks for humidity or rain.
    """
    test = wet or (lambda h: h.wet)
    out: list[Run] = []
    run: list[Hour] = []
    gap: list[Hour] = []

    def close() -> None:
        if not run:
            return
        temps = [h.temp_f for h in run if h.temp_f is not None]
        out.append(Run(
            start=run[0].at,
            end=run[-1].at,
            hours=sum(1 for h in run if test(h)),
            mean_temp_f=(sum(temps) / len(temps)) if temps else None,
            bridged=sum(1 for h in run if not test(h)),
        ))

    for h in hours:
        if test(h):
            run.extend(gap)
            gap = []
            run.append(h)
            continue
        if run and len(gap) < bridge:
            # Held open — it may yet be bridged. If the run ends here these
            # hours are dropped rather than counted, which is why they wait in
            # `gap` instead of going straight onto `run`.
            gap.append(h)
            continue
        close()
        run, gap = [], []
    close()
    return out


def longest(rs: Iterable[Run]) -> Run | None:
    """The run that most decides a verdict. None when nothing was wet."""
    best = None
    for r in rs:
        if best is None or r.hours > best.hours:
            best = r
    return best


def by_day(hours: Iterable[Hour]) -> dict[str, list[Hour]]:
    """Group into local calendar days, in order.

    The day is the feed's own local day, because Hutton is written in local days
    and a UTC grouping would split a Vermont night across two of them — which is
    exactly where the wet hours are.
    """
    days: dict[str, list[Hour]] = {}
    for h in hours:
        days.setdefault(h.day, []).append(h)
    return days


def since_reset(
    hours: Iterable[Hour], is_reset: Callable[[Hour], bool],
) -> list[tuple[str, int]]:
    """Running wet-hour count, zeroed whenever a reset event fires.

    The shared accumulator behind the sooty-blotch family: "hours of wetness
    since the last event that washed the count away". The reset is the caller's
    to define — a heavy rain, a scheduled date — because what resets a count is
    part of the model and not of the weather.
    """
    out: list[tuple[str, int]] = []
    total = 0
    for h in hours:
        if is_reset(h):
            total = 0
        elif h.wet:
            total += 1
        out.append((h.at, total))
    return out


def coverage(hours: list[Hour]) -> dict[str, Any]:
    """What the record could and could not say.

    Reported alongside every count, because "no infection period" and "no hours
    to look at" are different answers and a grower deserves to know which one
    they were given.
    """
    known = sum(1 for h in hours if h.known)
    return {
        "hours": len(hours),
        "hours_read": known,
        "hours_missing": len(hours) - known,
        "first": hours[0].at if hours else None,
        "last": hours[-1].at if hours else None,
    }
