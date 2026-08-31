"""Season curve assembly — validation and the degraded paths.

Upstream feeds are stubbed: a priced tool's behaviour must be provable
without depending on a live third-party service.
"""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import season, sources
from goodearth_mcp.region import parse_region

PIN = {"lat": 44.48, "lon": -73.21, "radius_m": 900}


def _record(days: int, tmax: float = 75.0, tmin: float = 55.0, elev: float = 100.0):
    return {
        "elevation": elev,
        "daily": {
            "time": [f"2026-0{1 + i // 28}-{1 + i % 28:02d}" for i in range(days)],
            "temperature_2m_max": [tmax] * days,
            "temperature_2m_min": [tmin] * days,
        },
    }


@pytest.mark.parametrize("bad", [-40.0, 0.0, 10.0, 95.0, 200.0])
async def test_celsius_base_temp_is_rejected(bad):
    """A Celsius base would return a plausible-looking wrong curve — refuse it."""
    with pytest.raises(season.SeasonError):
        await season.region_season_curve(parse_region(PIN), bad)


async def test_non_numeric_base_temp_is_rejected():
    with pytest.raises(season.SeasonError):
        await season.region_season_curve(parse_region(PIN), "warm")  # type: ignore[arg-type]


async def test_happy_path_returns_spread_band_and_projection(monkeypatch):
    region = parse_region(PIN)
    n = len(region.points)

    async def fake_elev(lats, lons):
        # A bench and a hollow, so the spread has something real to report.
        return [100.0 + (i * 40) for i in range(len(lats))]

    async def fake_history(lats, lons, start, end):
        return [_record(60) for _ in range(len(lats))]

    async def fake_forecast(lat, lon, days=7):
        return _record(days)

    monkeypatch.setattr(sources, "fetch_elevations", fake_elev)
    monkeypatch.setattr(sources, "fetch_daily_history", fake_history)
    monkeypatch.setattr(sources, "fetch_daily_forecast", fake_forecast)

    out = await season.region_season_curve(region, 50.0, today=date(2026, 3, 1))

    assert out["success"] is True
    assert out["base_temp_f"] == 50.0
    assert out["region"]["sample_count"] == n
    assert out["accumulated_gdd"]["n"] == n
    assert out["across_region"]["terrain_correction"] == "applied"
    assert out["curve"]["cumulative_mean"][-1] > 0
    assert out["forecast"] is not None
    assert out["projection"]["days"] == 75
    assert {s["name"] for s in out["sources"]}


async def test_terrain_variation_produces_a_real_spread(monkeypatch):
    """With varied elevation the region must report non-zero spread."""
    region = parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 2000})

    async def fake_elev(lats, lons):
        return [80.0 + i * 25 for i in range(len(lats))]

    async def fake_history(lats, lons, start, end):
        return [_record(90) for _ in range(len(lats))]

    async def fake_forecast(lat, lon, days=7):
        return _record(days)

    monkeypatch.setattr(sources, "fetch_elevations", fake_elev)
    monkeypatch.setattr(sources, "fetch_daily_history", fake_history)
    monkeypatch.setattr(sources, "fetch_daily_forecast", fake_forecast)

    out = await season.region_season_curve(region, 50.0, today=date(2026, 4, 1))
    assert out["accumulated_gdd"]["spread"] > 0


async def test_flat_elevation_reports_honest_zero_spread(monkeypatch):
    """Identical terrain must not be dressed up as variation."""
    region = parse_region(PIN)

    async def fake_elev(lats, lons):
        return [100.0] * len(lats)

    async def fake_history(lats, lons, start, end):
        return [_record(30) for _ in range(len(lats))]

    async def fake_forecast(lat, lon, days=7):
        return _record(days)

    monkeypatch.setattr(sources, "fetch_elevations", fake_elev)
    monkeypatch.setattr(sources, "fetch_daily_history", fake_history)
    monkeypatch.setattr(sources, "fetch_daily_forecast", fake_forecast)

    out = await season.region_season_curve(region, 50.0, today=date(2026, 2, 1))
    assert out["accumulated_gdd"]["spread"] == 0.0


async def test_elevation_outage_degrades_and_says_so(monkeypatch):
    """Losing terrain costs the spread, not the answer — and must be disclosed."""
    region = parse_region(PIN)

    async def boom(lats, lons):
        raise sources.UpstreamError("elevation service down")

    async def fake_history(lats, lons, start, end):
        return [_record(30) for _ in range(len(lats))]

    async def fake_forecast(lat, lon, days=7):
        return _record(days)

    monkeypatch.setattr(sources, "fetch_elevations", boom)
    monkeypatch.setattr(sources, "fetch_daily_history", fake_history)
    monkeypatch.setattr(sources, "fetch_daily_forecast", fake_forecast)

    out = await season.region_season_curve(region, 50.0, today=date(2026, 2, 1))
    assert out["success"] is True
    assert out["across_region"]["terrain_correction"] == "unavailable"
    assert "elevation service down" in out["across_region"]["terrain_note"]


async def test_forecast_outage_still_returns_the_season(monkeypatch):
    region = parse_region(PIN)

    async def fake_elev(lats, lons):
        return [100.0] * len(lats)

    async def fake_history(lats, lons, start, end):
        return [_record(30) for _ in range(len(lats))]

    async def boom(lat, lon, days=7):
        raise sources.UpstreamError("forecast down")

    monkeypatch.setattr(sources, "fetch_elevations", fake_elev)
    monkeypatch.setattr(sources, "fetch_daily_history", fake_history)
    monkeypatch.setattr(sources, "fetch_daily_forecast", boom)

    out = await season.region_season_curve(region, 50.0, today=date(2026, 2, 1))
    assert out["success"] is True
    assert out["forecast"] is None


async def test_history_outage_is_fatal(monkeypatch):
    """Without observations there is no season to report — fail loudly."""
    region = parse_region(PIN)

    async def fake_elev(lats, lons):
        return [100.0] * len(lats)

    async def boom(lats, lons, start, end):
        raise sources.UpstreamError("archive down")

    async def fake_forecast(lat, lon, days=7):
        return _record(days)

    monkeypatch.setattr(sources, "fetch_elevations", fake_elev)
    monkeypatch.setattr(sources, "fetch_daily_history", boom)
    monkeypatch.setattr(sources, "fetch_daily_forecast", fake_forecast)

    with pytest.raises(season.SeasonError):
        await season.region_season_curve(region, 50.0, today=date(2026, 2, 1))


async def test_malformed_upstream_record_does_not_crash(monkeypatch):
    """A feed that changes shape must not take the tool down with it."""
    region = parse_region(PIN)

    async def fake_elev(lats, lons):
        return [100.0] * len(lats)

    async def junk(lats, lons, start, end):
        return [{"daily": "not-a-dict"} for _ in range(len(lats))]

    async def fake_forecast(lat, lon, days=7):
        return _record(days)

    monkeypatch.setattr(sources, "fetch_elevations", fake_elev)
    monkeypatch.setattr(sources, "fetch_daily_history", junk)
    monkeypatch.setattr(sources, "fetch_daily_forecast", fake_forecast)

    with pytest.raises(season.SeasonError):
        await season.region_season_curve(region, 50.0, today=date(2026, 2, 1))
