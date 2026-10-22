"""The barometer: tendency in a barometer reader's words, and the storm it implies."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from goodearth_mcp import pressure, pressure_window, sources
from goodearth_mcp.block_store import EXAMPLE_BLOCK
from goodearth_mcp.region import parse_region

# Naive on purpose: the feed stamps hours on the block's own clock, with no zone.
START = datetime(2026, 10, 20, 0, 0)  # noqa: DTZ001


def hours(values: list[float | None], start: datetime = START) -> tuple[list[str], list[float | None]]:
    return [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(len(values))], values


def stamp(h: int) -> str:
    return (START + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M")


# ── Tendency ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("delta,words", [
    (0.0, "steady"),
    (0.05, "steady"),
    (-0.8, "falling slowly"),
    (1.5, "rising slowly"),
    (-1.6, "falling"),
    (-3.5, "falling"),
    (-3.6, "falling quickly"),
    (-6.0, "falling quickly"),
    (-6.1, "falling very rapidly"),
    (7.0, "rising very rapidly"),
])
def test_three_hour_change_reads_in_met_office_words(delta, words):
    assert pressure.tendency(delta)["words"] == words


def test_no_change_known_is_no_tendency():
    assert pressure.tendency(None) is None


# ── Storm level ─────────────────────────────────────────────────────────────


def test_a_steady_barometer_is_no_storm():
    t, v = hours([1015.0] * 80)
    out = pressure.storm_signal(t, v, now_at=stamp(30), lat=42.0)
    assert out["level"] == "none"
    assert out["window"] is None
    assert out["tendency"]["words"] == "steady"


def falling(rate_per_h: float, *, from_h: int, for_h: int, total: int = 110,
            start_hpa: float = 1016.0) -> list[float | None]:
    vals, p = [], start_hpa
    for i in range(total):
        if from_h <= i < from_h + for_h:
            p -= rate_per_h
        vals.append(round(p, 2))
    return vals


@pytest.mark.parametrize("rate,level", [
    (0.4, "none"),          # 1.2 hPa in 3 h: falling slowly
    (0.6, "unsettled"),     # 1.8 hPa in 3 h
    (1.3, "storm likely"),  # 3.9 hPa in 3 h: falling quickly
    (2.2, "severe"),        # 6.6 hPa in 3 h: very rapidly
])
def test_how_fast_it_falls_sets_the_level(rate, level):
    t, v = hours(falling(rate, from_h=60, for_h=4))
    out = pressure.storm_signal(t, v, now_at=stamp(48), lat=42.0)
    assert out["level"] == level


def test_a_fall_ahead_is_dated_and_windowed():
    t, v = hours(falling(1.3, from_h=60, for_h=4))
    out = pressure.storm_signal(t, v, now_at=stamp(48), lat=42.0)
    assert out["worst"]["at"] >= stamp(60)
    assert out["window"]["from"] <= out["worst"]["at"] <= out["window"]["to"]
    assert "three hours by" in out["reason"]


def test_a_long_slow_fall_into_a_low_is_still_a_storm():
    # 0.3 hPa an hour never reads faster than "slowly" over three hours, but
    # 7 hPa over the day down to 1005 is a low arriving.
    t, v = hours(falling(0.3, from_h=50, for_h=24, start_hpa=1012.0))
    out = pressure.storm_signal(t, v, now_at=stamp(48), lat=42.0)
    assert out["level"] == "storm likely"


def test_the_bomb_threshold_scales_with_latitude():
    assert pressure.bomb_fall_24h(60.0) == 24.0
    assert 18.0 < pressure.bomb_fall_24h(42.0) < 19.0
    assert pressure.bomb_fall_24h(-42.0) == pressure.bomb_fall_24h(42.0)
    # 20 hPa in a day, no three hours of it fast: explosive at 42° N, not at 60°.
    t, v = hours(falling(0.84, from_h=50, for_h=24, start_hpa=1020.0))
    assert pressure.storm_signal(t, v, now_at=stamp(48), lat=42.0)["level"] == "severe"
    assert pressure.storm_signal(t, v, now_at=stamp(48), lat=60.0)["level"] != "severe"


def test_a_fall_past_the_horizon_is_not_reported():
    t, v = hours(falling(2.5, from_h=48 + pressure.HORIZON_H + 3, for_h=4, total=140))
    assert pressure.storm_signal(t, v, now_at=stamp(48), lat=42.0)["level"] == "none"


def test_gaps_and_junk_do_not_break_it():
    vals = falling(1.3, from_h=60, for_h=4)
    vals[61] = None
    vals[30] = float("nan")
    t, v = hours(vals)
    out = pressure.storm_signal(t, v, now_at=stamp(48), lat=42.0)
    assert out["level"] in pressure.LEVELS


def test_no_reading_at_or_before_now_is_no_signal():
    t, v = hours([1015.0] * 10)
    assert pressure.storm_signal(t, v, now_at="2026-10-01T00:00", lat=42.0) is None
    assert pressure.storm_signal([], [], now_at=stamp(1), lat=42.0) is None


def test_a_short_series_has_no_tendency_yet():
    t, v = hours([1015.0, 1014.0])
    out = pressure.storm_signal(t, v, now_at=stamp(1), lat=42.0)
    assert out["tendency"] is None and out["level"] == "none"


# ── Windows ─────────────────────────────────────────────────────────────────


def test_a_bare_date_covers_its_whole_day():
    window = {"from": "2026-10-22T15:00", "to": "2026-10-22T19:00"}
    assert pressure.overlaps(window, "2026-10-22")
    assert not pressure.overlaps(window, "2026-10-23")
    assert pressure.overlaps(window, "2026-10-22T18:00", "2026-10-23T02:00")
    assert not pressure.overlaps(window, "2026-10-22T20:00", "2026-10-23T02:00")
    assert not pressure.overlaps(None, "2026-10-22")


# ── The shared reader ───────────────────────────────────────────────────────


def test_the_reader_uses_the_block_clock(monkeypatch):
    t, v = hours(falling(1.3, from_h=60, for_h=4))

    async def feed(lat, lon):
        return {"utc_offset_seconds": -4 * 3600, "hourly": {"time": t, "pressure_msl": v}}

    monkeypatch.setattr(sources, "fetch_pressure_hourly", feed)
    region = parse_region(EXAMPLE_BLOCK["geometry"])
    # 04:00 UTC on the 22nd is midnight on the block's clock: hour 48.
    out = asyncio.run(pressure_window.region_storm(region, datetime(2026, 10, 22, 4, 0, tzinfo=UTC)))
    assert out["at"] == stamp(48)
    assert out["level"] == "storm likely"


def test_a_silent_barometer_is_no_reading():
    region = parse_region(EXAMPLE_BLOCK["geometry"])
    assert asyncio.run(pressure_window.region_storm(region)) is None
