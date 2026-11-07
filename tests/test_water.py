"""The water balance: a running tally of rain against ET0, and the model's soil.

Hand-built days, so every figure is one a person can add up from the fixture.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from goodearth_mcp import sources, water, water_window
from goodearth_mcp.region import parse_region

DAYS = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]


def daily(rain, et0):
    return {"time": DAYS, "precipitation_sum": rain, "et0_fao_evapotranspiration": et0}


def hourly(layers: dict[str, float], hours_per_day: int = 2):
    times = [f"{d}T{h:02d}:00" for d in DAYS for h in range(hours_per_day)]
    return {"time": times, **{f: [v] * len(times) for f, v in layers.items()}}


EVEN = {f: 0.2 for f, _lo, _hi in water.LAYERS}


def test_the_balance_runs_from_the_first_day():
    out = water.assess(daily([0, 5, 0, 10], [2, 1, 3, 1]), hourly(EVEN),
                       today="2026-11-06", now_at="2026-11-06T01:00")
    assert [d["balance_mm"] for d in out["days"]] == [-2.0, 2.0, -1.0, 8.0]
    assert out["today"]["balance_mm"] == -1.0
    assert out["today"]["rain_mm"] == 5.0 and out["today"]["et0_mm"] == 6.0
    assert out["ahead"] == {"until": "2026-11-07", "rain_mm": 10.0, "et0_mm": 1.0, "balance_change_mm": 9.0}
    assert [d["forecast"] for d in out["days"]] == [False, False, False, True]


def test_a_missing_day_carries_the_balance_without_inventing_one():
    out = water.assess(daily([0, None, 0, 0], [2, 1, 1, 1]), hourly(EVEN),
                       today="2026-11-07", now_at="2026-11-07T01:00")
    assert out["days"][1]["net_mm"] is None
    assert [d["balance_mm"] for d in out["days"]] == [-2.0, -2.0, -3.0, -4.0]


def test_depths_are_weighted_by_layer_thickness():
    # A wet 0–1 cm skin over dry soil is mostly dry topsoil: 1 cm of 9.
    values = {"soil_moisture_0_to_1cm": 0.45, "soil_moisture_1_to_3cm": 0.18,
              "soil_moisture_3_to_9cm": 0.18, "soil_moisture_9_to_27cm": 0.3,
              "soil_moisture_27_to_81cm": 0.3}
    assert water.depth_mean(values, *water.TOPSOIL_CM) == pytest.approx(0.21, abs=1e-3)
    assert water.depth_mean(values, *water.ROOT_ZONE_CM) == 0.3


def test_soil_now_is_the_latest_hour_not_after_now():
    h = hourly(EVEN)
    h["soil_moisture_27_to_81cm"] = [0.1 * (i + 1) for i in range(len(h["time"]))]
    out = water.soil_at(h, "2026-11-05T01:30")
    # Hour index 3 is 2026-11-05T01:00; 27–81 cm is 54 of the root zone's 72 cm.
    assert out["root_zone"] == pytest.approx((0.2 * 18 + 0.4 * 54) / 72, abs=1e-3)


def test_no_soil_reading_is_none_not_zero():
    out = water.assess(daily([0, 0, 0, 0], [1, 1, 1, 1]), {"time": []},
                       today="2026-11-06", now_at="2026-11-06T01:00")
    assert out["today"]["topsoil"] is None and out["today"]["root_zone"] is None
    assert out["today"]["root_zone_week_change"] is None


def test_the_window_reads_one_forecast_at_the_centroid(monkeypatch):
    asked = []

    async def fake(lat, lon):
        asked.append((lat, lon))
        record = {"daily": daily([0, 0, 0, 0], [1, 1, 1, 1]), "hourly": hourly(EVEN), "utc_offset_seconds": 0}
        return sources._stamp(record, "Open-Meteo forecast", sources.FORECAST_RESOLUTION_M)

    monkeypatch.setattr(sources, "fetch_water", fake)
    region = parse_region({"lat": 44.1366, "lon": -73.356, "radius_m": 300})
    out = asyncio.run(water_window.region_water(region, now=datetime(2026, 11, 6, 12, tzinfo=UTC)))
    assert asked == [(region.centroid.lat, region.centroid.lon)]
    assert out["success"] and out["today"]["balance_mm"] == -3.0
    assert "not a soil bucket" in out["note"]


def test_a_forecast_with_no_days_is_refused(monkeypatch):
    async def empty(lat, lon):
        return {"daily": {"time": []}, "hourly": {"time": []}}

    monkeypatch.setattr(sources, "fetch_water", empty)
    with pytest.raises(water_window.WaterWindowError):
        asyncio.run(water_window.region_water(parse_region({"lat": 44.1, "lon": -73.3, "radius_m": 100})))
