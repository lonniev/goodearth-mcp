"""How often the forecast has been right here, measure by measure.

Good Earth's forecast is Open-Meteo's, and Open-Meteo keeps every run: what it
said one and three days before each hour of the last month is there to read
(`sources.fetch_previous_runs`). So the score is computed from that record on
demand — nothing of our own is stored while it waits to be scored, and a block
drawn today has a month's score today.

A day is a HIT when the forecast for it landed within a tolerance a grower
would act on the same way. The tolerances are named below, each with its why.
The truth is the latest run's reading for each hour, the reference Open-Meteo
itself scores against; it is a model's best estimate, not a station's.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from goodearth_mcp import record_cache, sources

logger = logging.getLogger(__name__)

#: Days scored, ending yesterday. A month is long enough that one stormy week
#: does not decide it, and short enough to describe this season's weather.
SPAN_DAYS = 30

#: A day is scored only when this many of its hours answered in both the
#: forecast and the truth; a day's high read from half its hours is a guess.
MIN_HOURS = 20

#: Rain is scored on the call, not the amount: a forecast of a quarter inch
#: that brought half an inch was still right to say "rain". Below this a day
#: is dry — a trace that wets nothing is not a day a grower changes plans for.
WET_IN = 0.04


@dataclass(frozen=True)
class Measure:
    """One almanac measure, read from an hourly field and rolled up to a day."""
    field: str
    roll: Callable[[list[float]], float]
    #: Within this of the truth is a hit, in the feed's US units. None scores
    #: the wet/dry call.
    within: float | None


def _mean(v: list[float]) -> float:
    return sum(v) / len(v)


MEASURES: dict[str, Measure] = {
    # ±3 °F is the width a grower already reads a forecast high or low with:
    # it changes whether to cover a bed only near frost, and that is the low's
    # own business, scored here like the high.
    "temp_max": Measure("temperature_2m", max, 3.0),
    "temp_min": Measure("temperature_2m", min, 3.0),
    "dew_point": Measure("dew_point_2m", _mean, 3.0),
    "precip": Measure("precipitation", sum, None),
    # A 5 mph miss is the difference between a breeze and a gust a row cover
    # notices; less is noise in a daily maximum.
    "wind_max": Measure("wind_speed_10m", max, 5.0),
    # Ten points of relative humidity is about what dawn-to-noon warming moves
    # it by; a closer test would score the clock, not the forecast.
    "humidity": Measure("relative_humidity_2m", _mean, 10.0),
    # 3 hPa is about a third of a typical storm's fall, and less than the
    # barometer's own three-hour tendency bands.
    "pressure": Measure("pressure_msl", _mean, 3.0),
}


def _by_day(times: list[Any], truth: list[Any], said: list[Any]) -> dict[str, tuple[list[float], list[float]]]:
    """Each local day's hours that answered in both series."""
    days: dict[str, tuple[list[float], list[float]]] = defaultdict(lambda: ([], []))
    for t, a, b in zip(times, truth, said, strict=False):
        if isinstance(a, (int, float)) and isinstance(b, (int, float)) and isinstance(t, str):
            days[t[:10]][0].append(float(a))
            days[t[:10]][1].append(float(b))
    return days


def _hit(m: Measure, truth: float, said: float) -> bool:
    if m.within is None:
        return (truth >= WET_IN) == (said >= WET_IN)
    return abs(truth - said) <= m.within


def score(payload: dict[str, Any]) -> dict[str, Any]:
    """Per measure and lead, how many scored days the forecast got right.

    ``{"temp_max": {"within": 3.0, "leads": {"1": {"hits", "days", "pct"}, …}}}``
    — a measure or lead with no scored day is absent rather than 0%.
    """
    hourly = payload.get("hourly") if isinstance(payload.get("hourly"), dict) else {}
    times = hourly.get("time") or []
    out: dict[str, Any] = {}
    for key, m in MEASURES.items():
        leads: dict[str, Any] = {}
        for n in sources.PREVIOUS_RUN_LEADS:
            days = _by_day(times, hourly.get(m.field) or [], hourly.get(f"{m.field}_previous_day{n}") or [])
            scored = [(m.roll(a), m.roll(b)) for a, b in days.values() if len(a) >= MIN_HOURS]
            if not scored:
                continue
            hits = sum(_hit(m, a, b) for a, b in scored)
            leads[str(n)] = {"hits": hits, "days": len(scored), "pct": round(100 * hits / len(scored))}
        if leads:
            out[key] = {"within": m.within, "leads": leads}
    return out


async def region_skill(lat: float, lon: float, today: date | None = None) -> dict[str, Any] | None:
    """The last month's score at this place, or None when it cannot be read.

    Remembered for good under its span: every hour in it is past, and a span
    ending yesterday re-keys itself tomorrow.
    """
    today = today or datetime.now(UTC).date()
    end = today - timedelta(days=1)
    start = end - timedelta(days=SPAN_DAYS - 1)
    subject = f"{lat:.2f}/{lon:.2f}/{start.isoformat()}/{end.isoformat()}"
    kept = await record_cache.remembered("forecast_skill", subject)
    if kept is not None:
        return kept
    try:
        payload = await sources.fetch_previous_runs(lat, lon, start.isoformat(), end.isoformat())
    except sources.UpstreamError as exc:
        logger.warning("forecast skill: previous runs unavailable (%s)", exc)
        return None
    found = {"from": start.isoformat(), "to": end.isoformat(), "measures": score(payload)}
    if found["measures"]:
        await record_cache.remember("forecast_skill", subject, found)
    return found
