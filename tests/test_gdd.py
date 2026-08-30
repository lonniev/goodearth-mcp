"""Degree-day maths and terrain downscaling."""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import gdd


def test_daily_gdd_basic_average():
    assert gdd.daily_gdd(80.0, 60.0, 50.0) == pytest.approx(20.0)


def test_cold_night_cannot_cancel_a_warm_day():
    """Clamping to base is the whole point — a plant does not un-grow overnight."""
    clamped = gdd.daily_gdd(70.0, 30.0, 50.0)
    naive = ((70.0 + 30.0) / 2.0) - 50.0
    assert clamped == pytest.approx(10.0)
    assert clamped > naive


def test_gdd_never_negative():
    assert gdd.daily_gdd(40.0, 20.0, 50.0) == 0.0


def test_upper_threshold_caps_a_hot_day():
    capped = gdd.daily_gdd(110.0, 70.0, 50.0, upper_f=86.0)
    uncapped = gdd.daily_gdd(110.0, 70.0, 50.0)
    assert capped < uncapped
    assert capped == pytest.approx(28.0)


def test_accumulate_is_monotonic_and_carries_gaps_flat():
    curve = gdd.accumulate([80.0, None, 80.0], [60.0, None, 60.0], 50.0)
    assert curve == [20.0, 20.0, 40.0]  # the gap pauses, it does not dip


def test_accumulate_handles_an_empty_season():
    assert gdd.accumulate([], [], 50.0) == []


# ── Terrain downscaling ──────────────────────────────────────────────────


def test_higher_ground_runs_cooler_by_the_lapse_rate():
    tmax, _ = gdd.downscale(70.0, 50.0, point_elev_m=300.0, grid_elev_m=100.0, region_max_elev_m=300.0)
    assert tmax < 70.0
    assert tmax == pytest.approx(70.0 - gdd.LAPSE_F_PER_M * 200.0, abs=0.01)


def test_lower_ground_runs_warmer_by_day_and_colder_by_night():
    """Cold-air drainage is a nocturnal process: it must move the min, not the max."""
    tmax, tmin = gdd.downscale(70.0, 50.0, point_elev_m=50.0, grid_elev_m=100.0, region_max_elev_m=250.0)
    assert tmax > 70.0          # lapse rate alone: lower is warmer by day
    assert tmin < 50.0          # pooling overwhelms the lapse gain at night


def test_drainage_is_capped():
    _, tmin = gdd.downscale(70.0, 50.0, point_elev_m=0.0, grid_elev_m=0.0, region_max_elev_m=9_000.0)
    assert tmin >= 50.0 - gdd.MAX_DRAINAGE_F - 0.001


def test_flat_terrain_is_a_no_op():
    assert gdd.downscale(70.0, 50.0, 100.0, 100.0, 100.0) == (70.0, 50.0)


def test_hollow_accumulates_differently_from_bench():
    """The spread the product sells must actually survive into the curve."""
    bench = gdd.downscale(70.0, 45.0, 260.0, 180.0, 260.0)
    hollow = gdd.downscale(70.0, 45.0, 120.0, 180.0, 260.0)
    assert gdd.daily_gdd(*bench, 50.0) != gdd.daily_gdd(*hollow, 50.0)


# ── Season helpers ───────────────────────────────────────────────────────


def test_season_start_is_jan_1():
    assert gdd.season_start(date(2026, 8, 30)) == date(2026, 1, 1)


def test_normals_years_walks_back_the_requested_span():
    rs = gdd.normals_years(date(2026, 8, 30), span=10)
    assert len(rs) == 10
    assert rs[0] == ("2025-01-01", "2025-08-30")
    assert rs[-1] == ("2016-01-01", "2016-08-30")


def test_normals_years_survives_leap_day():
    """Feb 29 in a non-leap year must thin the window by a day, not drop the year."""
    rs = gdd.normals_years(date(2024, 2, 29), span=3)
    assert len(rs) == 3
    assert all(s < e for s, e in rs)


def test_band_reports_per_day_min_mean_max():
    b = gdd.band([[10.0, 20.0], [12.0, 30.0]])
    assert b == [
        {"min": 10.0, "mean": 11.0, "max": 12.0},
        {"min": 20.0, "mean": 25.0, "max": 30.0},
    ]


def test_band_of_uneven_curves_truncates_to_the_shortest():
    assert len(gdd.band([[1.0, 2.0, 3.0], [1.0]])) == 1


def test_band_of_nothing_is_none():
    assert gdd.band([]) is None
    assert gdd.band([[]]) is None


def test_project_carries_the_recent_rate():
    assert gdd.project(100.0, [10.0, 10.0], 3) == [110.0, 120.0, 130.0]


def test_project_declines_without_a_rate_or_a_horizon():
    assert gdd.project(100.0, [], 5) == []
    assert gdd.project(100.0, [10.0], 0) == []


def test_daily_increments_inverts_accumulation():
    assert gdd.daily_increments([0.0, 10.0, 25.0]) == [10.0, 15.0]


def test_date_series_counts_forward():
    assert gdd.date_series(date(2026, 8, 30), 3) == ["2026-08-30", "2026-08-31", "2026-09-01"]
