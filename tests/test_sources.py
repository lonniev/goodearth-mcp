"""Upstream feed parsing — shapes, batching, and malformed responses."""

from __future__ import annotations

import httpx
import pytest
import respx

from goodearth_mcp import sources


def test_daily_series_reads_a_record():
    rec = {"daily": {"time": ["2026-01-01"], "temperature_2m_max": [40.0], "temperature_2m_min": [20.0]}}
    dates, tmax, tmin = sources.daily_series(rec)
    assert dates == ["2026-01-01"]
    assert tmax == [40.0]
    assert tmin == [20.0]


def test_daily_series_preserves_gaps_as_none():
    """A missing day must stay distinguishable from a shorter season."""
    rec = {"daily": {"time": ["a", "b"], "temperature_2m_max": [40.0, None], "temperature_2m_min": [20.0, None]}}
    _, tmax, tmin = sources.daily_series(rec)
    assert tmax == [40.0, None]
    assert tmin == [20.0, None]


def test_daily_series_truncates_to_the_shortest_array():
    rec = {"daily": {"time": ["a", "b"], "temperature_2m_max": [1.0], "temperature_2m_min": [0.0, 0.0]}}
    dates, tmax, tmin = sources.daily_series(rec)
    assert len(dates) == len(tmax) == len(tmin) == 1


@pytest.mark.parametrize("bad", [{}, {"daily": None}, {"daily": "nope"}, {"daily": {"time": "x"}}])
def test_daily_series_rejects_malformed_records(bad):
    with pytest.raises(sources.UpstreamError):
        sources.daily_series(bad)


@respx.mock
async def test_elevations_are_batched_into_one_request():
    route = respx.get(sources._ELEVATION).mock(
        return_value=httpx.Response(200, json={"elevation": [76.0, 97.0, 37.0]})
    )
    out = await sources.fetch_elevations([44.48, 44.46, 44.50], [-73.21, -73.19, -73.23])
    assert out == [76.0, 97.0, 37.0]
    assert route.call_count == 1


@respx.mock
async def test_elevation_count_mismatch_is_an_error():
    """A short array would silently misalign every point's correction."""
    respx.get(sources._ELEVATION).mock(return_value=httpx.Response(200, json={"elevation": [76.0]}))
    with pytest.raises(sources.UpstreamError):
        await sources.fetch_elevations([44.48, 44.46], [-73.21, -73.19])


async def test_no_points_makes_no_request():
    assert await sources.fetch_elevations([], []) == []
    assert await sources.fetch_daily_history([], [], "2026-01-01", "2026-01-02") == []


@respx.mock
async def test_single_location_object_is_normalized_to_a_list():
    """Open-Meteo returns a bare object for one point and an array for many."""
    respx.get(sources._ARCHIVE).mock(
        return_value=httpx.Response(200, json={"daily": {"time": [], "temperature_2m_max": [], "temperature_2m_min": []}})
    )
    out = await sources.fetch_daily_history([44.48], [-73.21], "2026-01-01", "2026-01-02")
    assert isinstance(out, list) and len(out) == 1


@respx.mock
async def test_http_error_becomes_upstream_error():
    respx.get(sources._ARCHIVE).mock(return_value=httpx.Response(503))
    with pytest.raises(sources.UpstreamError):
        await sources.fetch_daily_history([44.48], [-73.21], "2026-01-01", "2026-01-02")


@respx.mock
async def test_forecast_days_are_clamped_to_the_api_limit():
    route = respx.get(sources._FORECAST).mock(
        return_value=httpx.Response(200, json={"daily": {"time": [], "temperature_2m_max": [], "temperature_2m_min": []}})
    )
    await sources.fetch_daily_forecast(44.48, -73.21, days=999)
    assert route.calls[0].request.url.params["forecast_days"] == "16"
