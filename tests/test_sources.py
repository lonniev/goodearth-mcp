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


# ── Daymet ───────────────────────────────────────────────────────────────

_DAYMET_HEAD = (
    "Latitude: 44.4813  Longitude: -73.2083\n"
    "Tile: 12114\n"
    "Elevation: 77 meters\n"
    "All years; all variables; Daymet Software Version 4.0\n"
    "How to cite: Thornton; M.M.; et al. 2022.\n"
)


def _csv(rows: str) -> str:
    return _DAYMET_HEAD + "year,yday,tmax (deg c),tmin (deg c)\n" + rows


def test_daymet_yday_is_the_civil_day_of_year():
    """Feb 29 is day 60 in a leap year — verified against the live feed.

    The tempting "fix" is to shift days after February in a leap year. That
    would slide an entire leap season by one day, and the shift would look
    like a real phenological difference rather than a bug.
    """
    assert sources.daymet_date(2024, 60) == "2024-02-29"
    assert sources.daymet_date(2024, 61) == "2024-03-01"
    assert sources.daymet_date(2023, 60) == "2023-03-01"
    assert sources.daymet_date(2026, 1) == "2026-01-01"


def test_daymet_drops_december_31_in_a_leap_year():
    """365 records a year, so a leap year's last day is Dec 30."""
    assert sources.daymet_date(2024, 365) == "2024-12-30"
    assert sources.daymet_date(2023, 365) == "2023-12-31"


def test_daymet_parses_to_fahrenheit():
    dates, tmax, tmin = sources.parse_daymet_csv(
        _csv("2025,152,15.27,8.28\n2025,153,22.29,8.07\n"), "2025-06-01", "2025-06-02"
    )
    assert dates == ["2025-06-01", "2025-06-02"]
    assert tmax[0] == pytest.approx(59.486)
    assert tmin[0] == pytest.approx(46.904)


def test_daymet_rejects_the_silent_full_record_dump():
    """The trap: out-of-range answers 200 with every year it holds.

    Asking for three days of 2026 returns ~16,800 rows starting in 1980.
    Nothing in the response says so — no error code, no message — so the
    only defence is to check the span actually came back.
    """
    rows = "".join(f"{y},152,15.0,5.0\n" for y in range(1980, 2026))
    with pytest.raises(sources.UpstreamError, match="does not cover"):
        sources.parse_daymet_csv(_csv(rows), "2026-06-01", "2026-06-03")


def test_daymet_span_check_survives_new_years_being_published():
    """Containment, not a row count or a hardcoded cutoff.

    A cutoff constant would rot the moment ORNL publishes another year —
    exactly the failure that put an 800 m grid floor on a 90 m design.
    """
    dates, _, _ = sources.parse_daymet_csv(
        _csv("2025,152,15.0,5.0\n"), "2025-01-01", "2025-12-31"
    )
    assert dates == ["2025-06-01"]


def test_daymet_raises_on_a_response_with_no_rows():
    with pytest.raises(sources.UpstreamError, match="no rows"):
        sources.parse_daymet_csv(_csv(""), "2025-06-01", "2025-06-02")


def test_daymet_raises_when_the_header_is_missing():
    with pytest.raises(sources.UpstreamError, match="no data header"):
        sources.parse_daymet_csv("<html>503</html>", "2025-06-01", "2025-06-02")


@pytest.mark.asyncio
@respx.mock
async def test_fetch_daymet_history_reports_its_resolution():
    respx.get(url__startswith="https://daymet.ornl.gov").mock(
        return_value=httpx.Response(200, text=_csv("2025,152,15.27,8.28\n"))
    )
    out = await sources.fetch_daymet_history(44.4813, -73.2083, "2025-06-01", "2025-06-01")
    assert out["resolution_m"] == 1_000
    assert out["daily"]["time"] == ["2025-06-01"]
