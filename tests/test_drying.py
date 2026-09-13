"""Drying: when the dew burns off, the dry days ahead, and the next rain.

Hand-built hours, so every verdict is one a person can check by reading the
fixture. Days are 2026-09-14 (Mon) onward.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from goodearth_mcp import drying, drying_window, record_cache, sources
from goodearth_mcp.block_store import EXAMPLE_BLOCK
from goodearth_mcp.region import parse_region


def day(d: str, *, wet: set[int] = frozenset(), rain: set[int] = frozenset(), et0: float = 0.1):
    """24 hours. `wet` hours are humid (RH 95); `rain` hours carry 1 mm."""
    rows = []
    for h in range(24):
        rows.append({
            "time": f"{d}T{h:02d}:00",
            "temperature_2m": 60.0,
            "relative_humidity_2m": 95.0 if h in wet else 60.0,
            "dew_point_2m": 58.0 if h in wet else 46.0,
            "precipitation": 1.0 if h in rain else 0.0,
            "et0_fao_evapotranspiration": et0,
            "vapour_pressure_deficit": 0.2 if h in wet else 1.1,
            "shortwave_radiation": 400.0 if 8 <= h <= 17 else 0.0,
            "wind_speed_10m": 6.0,
        })
    return rows


def block(*days) -> dict:
    rows = [r for d in days for r in d]
    return {k: [r[k] for r in rows] for k in rows[0]}


def hours(*days):
    return drying.read_hours(block(*days))


# ── Dew off ──────────────────────────────────────────────────────────────


def test_the_dew_clears_at_the_first_dry_hour_after_a_wet_night():
    hs = hours(day("2026-09-14", wet=set(range(9))))
    assert drying.dew_off(hs, "2026-09-14") == {"state": "clears", "at": "2026-09-14T09:00"}


def test_a_dry_morning_says_so():
    hs = hours(day("2026-09-14"))
    assert drying.dew_off(hs, "2026-09-14")["state"] == "dry"


def test_a_lull_is_not_a_morning():
    # Wet to 5, one dry hour, wet again 7-8: the dew is off at 9, not at 6.
    hs = hours(day("2026-09-14", wet={0, 1, 2, 3, 4, 5, 7, 8}))
    assert drying.dew_off(hs, "2026-09-14")["at"] == "2026-09-14T09:00"


def test_still_wet_at_the_end_of_the_morning_is_a_wet_morning():
    hs = hours(day("2026-09-14", wet=set(range(15))))
    assert drying.dew_off(hs, "2026-09-14") == {"state": "wet", "at": None}


def test_a_day_the_feed_did_not_fill_is_unknown_not_dry():
    assert drying.dew_off(hours(day("2026-09-14")), "2026-09-15")["state"] == "unknown"


# ── Days, runs and rain ──────────────────────────────────────────────────


def test_a_dry_day_has_no_hour_of_rain():
    days = drying.summarize(hours(day("2026-09-14", rain={15}), day("2026-09-15")))
    assert [d["dry"] for d in days] == [False, True]
    assert days[0]["rain_mm"] == 1.0


def test_the_run_starts_at_the_first_dry_day_and_names_its_strongest_day():
    days = drying.summarize(hours(
        day("2026-09-14", rain={6}),
        day("2026-09-15", et0=0.10), day("2026-09-16", et0=0.20), day("2026-09-17", et0=0.15),
        day("2026-09-18", rain={14}),
    ))
    run = drying.dry_run(days, "2026-09-14")
    assert run == {"start": "2026-09-15", "end": "2026-09-17", "days": 3, "strongest": "2026-09-16"}


def test_no_dry_day_is_no_run():
    days = drying.summarize(hours(day("2026-09-14", rain={6}), day("2026-09-15", rain={6})))
    assert drying.dry_run(days, "2026-09-14") is None


def test_the_next_rain_is_after_now_not_this_morning():
    hs = hours(day("2026-09-14", rain={6}), day("2026-09-15"), day("2026-09-16", rain={14}))
    assert drying.next_rain(hs, "2026-09-14T10:00")["at"] == "2026-09-16T14:00"


# ── The window, from one forecast call ──────────────────────────────────


def test_the_window_reads_the_block_clock_and_never_the_season_cache(monkeypatch):
    record = {
        "utc_offset_seconds": -4 * 3600,   # Vermont in September
        "hourly": block(day("2026-09-14", wet=set(range(9))), day("2026-09-15"),
                        day("2026-09-16", rain={14})),
    }

    async def forecast(lat, lon, days, hourly=""):
        assert "et0_fao_evapotranspiration" in hourly, "the drying fields were not asked for"
        return record

    async def season_cache(*_a, **_k):
        raise AssertionError("the drying line must not touch the cached season record")

    monkeypatch.setattr(sources, "fetch_wetness_forecast", forecast)
    monkeypatch.setattr(record_cache, "wetness_history", season_cache)

    region = parse_region(EXAMPLE_BLOCK["geometry"])
    # 11:30 UTC is 07:30 on the block's clock: the dew has not burned off yet.
    now = datetime(2026, 9, 14, 11, 30, tzinfo=UTC)
    out = asyncio.run(drying_window.region_drying_window(region, now=now))

    assert out["now"] == "2026-09-14T07:00"
    assert out["today"]["dew_off"] == {"state": "clears", "at": "2026-09-14T09:00"}
    assert out["dry_run"]["start"] == "2026-09-14"
    assert out["next_rain"]["at"] == "2026-09-16T14:00"
    assert "never" in out["note"] and "grower's call" in out["note"]


def test_conditions_never_a_verdict_on_the_crop():
    text = drying.NOTE.lower()
    for word in ("ready to cut", "cure"):
        assert word in text  # named only to say it is NOT this service's to judge
    assert "grower's call" in text
