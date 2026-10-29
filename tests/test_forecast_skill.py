"""How often the forecast was right: scored from Open-Meteo's previous runs."""

from __future__ import annotations

import asyncio
from datetime import date

import pytest

from goodearth_mcp import forecast_skill, record_cache, sources
from goodearth_mcp.forecast_skill import MIN_HOURS, WET_IN, score


def _hours(day: str, n: int = 24) -> list[str]:
    return [f"{day}T{h:02d}:00" for h in range(n)]


def _payload(days: dict[str, dict[str, tuple[list[float], list[float], list[float]]]]) -> dict:
    """``{day: {field: (truth, day1, day3)}}`` as an hourly payload."""
    hourly: dict[str, list] = {"time": []}
    for day, fields in days.items():
        n = len(next(iter(fields.values()))[0])
        hourly["time"] += _hours(day, n)
        for f, (truth, d1, d3) in fields.items():
            hourly.setdefault(f, []).extend(truth)
            hourly.setdefault(f"{f}_previous_day1", []).extend(d1)
            hourly.setdefault(f"{f}_previous_day3", []).extend(d3)
    return {"hourly": hourly}


def flat(v: float, n: int = 24) -> list[float]:
    return [v] * n


def test_a_high_within_three_degrees_is_a_hit_and_one_beyond_is_not():
    p = _payload({
        "2026-10-01": {"temperature_2m": (flat(60), flat(63), flat(63.5))},
        "2026-10-02": {"temperature_2m": (flat(60), flat(57), flat(56.9))},
    })
    leads = score(p)["temp_max"]["leads"]
    assert leads["1"] == {"hits": 2, "days": 2, "pct": 100}
    assert leads["3"] == {"hits": 0, "days": 2, "pct": 0}


def test_high_and_low_are_the_days_max_and_min():
    truth = [50.0] * 12 + [70.0] * 12
    said = [55.0] * 12 + [70.0] * 12       # low missed by 5, high right
    s = score(_payload({"2026-10-01": {"temperature_2m": (truth, said, said)}}))
    assert s["temp_max"]["leads"]["1"]["hits"] == 1
    assert s["temp_min"]["leads"]["1"]["hits"] == 0


def test_rain_is_scored_on_the_call_not_the_amount():
    wet = [0.0] * 23 + [0.5]
    lighter = [0.0] * 23 + [0.2]
    trace = [0.0] * 23 + [WET_IN / 2]
    p = _payload({
        "2026-10-01": {"precipitation": (wet, lighter, trace)},   # rain/rain ✓ ; rain/dry ✗
        "2026-10-02": {"precipitation": (flat(0), trace, lighter)},  # dry/dry ✓ ; dry/rain ✗
    })
    leads = score(p)["precip"]["leads"]
    assert leads["1"]["pct"] == 100
    assert leads["3"]["pct"] == 0
    assert score(p)["precip"]["within"] is None


def test_a_day_with_too_few_hours_is_not_scored():
    p = _payload({
        "2026-10-01": {"temperature_2m": (flat(60, MIN_HOURS - 1), flat(80, MIN_HOURS - 1), flat(80, MIN_HOURS - 1))},
        "2026-10-02": {"temperature_2m": (flat(60), flat(60), flat(60))},
    })
    assert score(p)["temp_max"]["leads"]["1"] == {"hits": 1, "days": 1, "pct": 100}


def test_missing_hours_are_skipped_not_read_as_zero():
    truth = flat(60)
    said: list = flat(60)
    said[3] = None
    s = score(_payload({"2026-10-01": {"pressure_msl": (truth, said, said)}}))
    assert s["pressure"]["leads"]["1"]["hits"] == 1


def test_a_measure_with_no_scored_day_is_absent_not_zero():
    s = score(_payload({"2026-10-01": {"temperature_2m": (flat(60), flat(60), flat(60))}}))
    assert "humidity" not in s and "wind_max" not in s
    assert score({}) == {}


def test_days_are_the_feeds_local_days():
    # timezone=auto: the hour stamps are local, so a day is its first ten
    # characters — 23:00 belongs to the day it says, not to UTC's next one.
    times = ["2026-10-01T23:00"] * 24
    p = {"hourly": {"time": times, "temperature_2m": flat(60), "temperature_2m_previous_day1": flat(60),
                    "temperature_2m_previous_day3": flat(60)}}
    assert score(p)["temp_max"]["leads"]["1"]["days"] == 1


def test_the_score_is_remembered_under_its_span(monkeypatch):
    calls: list[tuple] = []
    kept: dict = {}

    async def runs(lat, lon, start, end):
        calls.append((start, end))
        return _payload({"2026-10-27": {"temperature_2m": (flat(60), flat(60), flat(70))}})

    async def remembered(kind, subject):
        return kept.get((kind, subject))

    async def remember(kind, subject, value):
        kept[(kind, subject)] = value

    monkeypatch.setattr(sources, "fetch_previous_runs", runs)
    monkeypatch.setattr(record_cache, "remembered", remembered)
    monkeypatch.setattr(record_cache, "remember", remember)

    today = date(2026, 10, 29)
    first = asyncio.run(forecast_skill.region_skill(42.5, -72.5, today))
    again = asyncio.run(forecast_skill.region_skill(42.5, -72.5, today))
    assert first == again
    assert calls == [("2026-09-29", "2026-10-28")]
    assert first["measures"]["temp_max"]["leads"]["3"]["pct"] == 0


def test_no_record_of_runs_is_no_score(monkeypatch):
    async def nothing(kind, subject):
        return None

    monkeypatch.setattr(record_cache, "remembered", nothing)
    # conftest's default: the previous-runs feed refuses.
    assert asyncio.run(forecast_skill.region_skill(42.5, -72.5, date(2026, 10, 29))) is None


@pytest.mark.parametrize("key", list(forecast_skill.MEASURES))
def test_every_measure_names_an_almanac_measure(key):
    from goodearth_mcp.almanac_window import MEASURES
    assert key in MEASURES
    assert forecast_skill.MEASURES[key].field in sources.PREVIOUS_RUN_FIELDS
