"""The historical range is drawn as far right as the chart goes.

Every chart in this service reads one season against the range of the ten
before it, and every one of them cut that range off at today — so the forecast
and the projection, the part a grower is actually asking about, had nothing
behind them to be read against. The data was never missing: a normal range is
history, and history has a figure for November as readily as for September.
The band stopped because the loops that built it counted the days the season
had lived rather than the days the chart would draw.

Nothing else about the band changes. It is the same ten seasons, the same
min/mean/max, the same fill — it simply reaches the edge.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest

from goodearth_mcp import almanac_window, block_store, gdd, record_cache, sources
from goodearth_mcp import region as reg
from goodearth_mcp.almanac_window import MEASURES, region_almanac

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])


def _days(start: date, end: date) -> list[str]:
    out, d = [], start
    while d <= end:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


# ── The heat curve's band ────────────────────────────────────────────────


def _decade(start: date, end: date) -> tuple[list[str], list[float], list[float]]:
    dates = _days(start, end)
    return dates, [60.0] * len(dates), [40.0] * len(dates)


def test_each_season_in_the_band_runs_to_its_own_year_end():
    """Not to today's day of it, which is where it used to stop."""
    dates, hi, lo = _decade(date(2024, 1, 1), date(2025, 12, 31))
    curves = gdd.yearly_curves(dates, hi, lo, date(2026, 9, 20), 2, 50.0)
    assert len(curves) == 2
    assert all(len(c) in (365, 366) for c in curves), [len(c) for c in curves]


def test_the_band_covers_the_whole_year():
    dates, hi, lo = _decade(date(2024, 1, 1), date(2025, 12, 31))
    band = gdd.band(gdd.yearly_curves(dates, hi, lo, date(2026, 9, 20), 2, 50.0))
    assert band is not None
    assert len(band) >= 365


def test_the_band_still_rises_all_the_way_to_december():
    """A cumulative curve that flattened after September would mean the
    extension had read empty days rather than real ones."""
    dates, hi, lo = _decade(date(2024, 1, 1), date(2025, 12, 31))
    band = gdd.band(gdd.yearly_curves(dates, hi, lo, date(2026, 9, 20), 2, 50.0))
    assert band is not None
    assert band[-1]["mean"] > band[262]["mean"] > band[180]["mean"]


def test_a_season_the_archive_does_not_reach_is_still_left_out():
    """The guard that already existed: a year with no readings is no season.

    Worth pinning now that the window asks for twelve months rather than nine,
    because a year the feed only half carries must not become a tenth season
    made mostly of gaps.
    """
    dates, hi, lo = _decade(date(2025, 1, 1), date(2025, 12, 31))
    curves = gdd.yearly_curves(dates, hi, lo, date(2026, 9, 20), 3, 50.0)
    assert len(curves) == 1


# ── The almanac's bands ──────────────────────────────────────────────────


TODAY = date(2026, 9, 20)
AHEAD = 14


def _block(dates: list[str], value: float = 50.0) -> dict[str, Any]:
    daily: dict[str, Any] = {"time": dates}
    for spec in MEASURES.values():
        daily[spec["field"]] = [value] * len(dates)
    return {"daily": daily}


@pytest.fixture
def _feeds(monkeypatch):
    """A season to today, ten finished years behind it, a fortnight ahead."""
    season = _days(date(2026, 1, 1), TODAY)
    deep = _days(date(2016, 1, 1), date(2025, 12, 31))
    ahead = _days(TODAY, TODAY + timedelta(days=AHEAD - 1))

    async def almanac_history(lat, lon, start, end):
        return _block(deep) if start.startswith("2016") else _block(season)

    async def forecast(lat, lon, days=14):
        return _block(ahead)

    monkeypatch.setattr(record_cache, "almanac_history", almanac_history)
    monkeypatch.setattr(sources, "fetch_almanac_forecast", forecast)
    monkeypatch.setattr(almanac_window.sources, "fetch_almanac_forecast", forecast)
    return {"season": season, "ahead": ahead}


async def test_the_band_reaches_the_last_forecast_day(_feeds):
    """The whole point. It used to end on the last recorded day."""
    out = await region_almanac(REGION, today=TODAY)
    want = len(_feeds["season"]) + len(_feeds["ahead"])
    for key in MEASURES:
        band = out["measures"][key]["normal"]
        assert band is not None and len(band) == want, key


async def test_the_days_ahead_carry_real_figures(_feeds):
    """An extension padded with zeroes would draw a band collapsing to the
    axis — worse than the gap it replaced, because it looks like an answer."""
    out = await region_almanac(REGION, today=TODAY)
    tail = out["measures"]["temp_max"]["normal"][-AHEAD:]
    assert all(b["mean"] == pytest.approx(50.0) for b in tail)


async def test_normally_by_now_still_means_by_now(_feeds):
    """The Rain card says "normally 28.85 by now". With the band running past
    today, a total that swept the days ahead in with it would answer a
    different question than the sentence asks."""
    out = await region_almanac(REGION, today=TODAY)
    rain = out["measures"]["precip"]
    assert rain["normal_total"] == pytest.approx(50.0 * len(_feeds["season"]), rel=1e-3)


async def test_the_normal_for_today_is_still_todays(_feeds):
    """`normal_today` indexes the band by how many days the season has run.
    A longer band must not move it."""
    out = await region_almanac(REGION, today=TODAY)
    assert out["measures"]["temp_max"]["normal_today"]["mean"] == pytest.approx(50.0)


async def test_a_forecast_crossing_new_year_looks_at_the_following_january(monkeypatch):
    """The fortnight of the year when the naive alignment is twelve months out.

    Asking for "the same day in season 2016" is right until the day in
    question is next January, which followed the 2016 season rather than
    opening it. Only the Januaries carry a reading here, so a band with
    figures in its tail proves which January was read.
    """
    new_year = date(2026, 12, 28)
    season = _days(date(2026, 1, 1), new_year)
    ahead = _days(new_year, new_year + timedelta(days=9))     # into 2027-01-06

    # Every January in the record carries a reading; nothing else does. A band
    # aligned to the January that OPENED each season would find 2016-01,
    # which is in this record too — so the tell is the value, not its presence.
    januaries = [d for d in _days(date(2016, 1, 1), date(2025, 12, 31)) if d[5:7] == "01"]

    def deep_block() -> dict[str, Any]:
        daily: dict[str, Any] = {"time": januaries}
        for spec in MEASURES.values():
            # Each January answers with its own year: 2017-01 gives 17.
            daily[spec["field"]] = [float(d[2:4]) for d in januaries]
        return {"daily": daily}

    async def almanac_history(lat, lon, start, end):
        return deep_block() if start.startswith("2016") else _block(season)

    async def forecast(lat, lon, days=14):
        return _block(ahead)

    monkeypatch.setattr(record_cache, "almanac_history", almanac_history)
    monkeypatch.setattr(sources, "fetch_almanac_forecast", forecast)
    monkeypatch.setattr(almanac_window.sources, "fetch_almanac_forecast", forecast)

    out = await region_almanac(REGION, today=new_year)
    band = out["measures"]["temp_max"]["normal"]
    # The last chart day is 2027-01-06. Read as the January that FOLLOWED
    # each season it averages 17..25 — nine of them, 2026 being absent from
    # the record — which is 21.0. Read as the January that OPENED each, it
    # averages 16..25, which is 20.5. Only the exact figure tells them
    # apart, so the exact figure is what is asserted.
    assert band[-1]["mean"] == pytest.approx(21.0)
