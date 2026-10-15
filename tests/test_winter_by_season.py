"""Winter, read on each side of the equator.

Chill from November, the sap run from December, spring soil from February —
each window was written for the north. A Canberra orchard banks its chill in
June and taps nothing in January.
"""

from __future__ import annotations

from datetime import date, timedelta

from goodearth_mcp import chill, frost, gdd, perennial, planting, soil, tree_year

NORTH = 44.5   # Vermont
SOUTH = -35.3  # Canberra


def _days(start: date, end: date) -> list[str]:
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


# ── The calendar, six months on ──────────────────────────────────────────


def test_a_northern_day_is_itself_in_the_north_and_six_months_on_in_the_south():
    assert gdd.hemisphere((11, 1), NORTH) == (11, 1)
    assert gdd.hemisphere((11, 1), SOUTH) == (5, 1)
    assert gdd.hemisphere((2, 15), SOUTH) == (8, 15)


def test_a_month_end_that_june_lacks_is_its_last_day():
    assert gdd.hemisphere((12, 31), SOUTH) == (6, 30)


def test_a_window_may_run_across_the_new_year():
    assert gdd.within(date(2027, 1, 5), (12, 1), (5, 15))
    assert not gdd.within(date(2026, 8, 1), (12, 1), (5, 15))
    assert gdd.within(date(2026, 8, 1), (6, 1), (11, 15))


def test_a_season_day_is_the_same_calendar_day_in_a_leap_year():
    assert gdd.season_offset(date(2024, 3, 1), date(2024, 1, 1)) == \
        gdd.season_offset(date(2023, 3, 1), date(2023, 1, 1))
    assert gdd.from_season_offset(date(2024, 1, 1), 59) == date(2024, 3, 1)


# ── Chill ────────────────────────────────────────────────────────────────


def test_southern_chill_is_banked_from_may_to_mid_august():
    assert chill.in_dormancy(date(2026, 6, 20), SOUTH)
    assert not chill.in_dormancy(date(2026, 12, 20), SOUTH)
    assert not chill.in_dormancy(date(2026, 8, 16), SOUTH)


def test_a_southern_winter_takes_the_name_of_its_year():
    assert chill.dormancy_ending(date(2026, 5, 1), SOUTH) == 2026
    assert chill.dormancy_ending(date(2025, 11, 15), NORTH) == 2026


def test_a_southern_winter_is_whole_once_august_15_has_passed():
    dates = _days(date(2026, 5, 1), date(2026, 8, 15))
    [w] = chill.banked(dates, [44.0] * len(dates), [34.0] * len(dates), SOUTH)
    assert w["winter"] == 2026 and w["days"] == len(dates)
    assert not chill.finished(w, date(2026, 8, 1), SOUTH)
    assert chill.finished(w, date(2026, 8, 15), SOUTH)


def test_the_summary_states_this_ground_s_own_window():
    whole = {"winter": 2026, "hours": 900.0, "days": 100, "gaps": 0}
    assert chill.summarize([whole], SOUTH)["window"] == "1 May – 15 Aug"
    assert chill.summarize([whole], NORTH)["window"] == "1 Nov – 15 Feb"


# ── The coldest winter night ─────────────────────────────────────────────


def test_a_southern_july_night_is_winter_and_a_january_night_is_not():
    lows = perennial.winter_lows(["2026-01-10", "2026-07-04"], [28.0, 18.0], SOUTH)
    assert lows == [{"winter": 2026, "low_f": 18.0, "on": "2026-07-04"}]


# ── The sap run ──────────────────────────────────────────────────────────


def test_the_southern_sap_winter_is_june_to_mid_november():
    assert tree_year.sap_winter(date(2026, 8, 1), SOUTH) == (date(2026, 6, 1), date(2026, 11, 15))
    assert tree_year.sap_winter(date(2027, 3, 1), SOUTH) == (date(2026, 6, 1), date(2026, 11, 15))


def test_a_southern_run_is_named_by_its_year_and_window():
    dates = _days(date(2026, 6, 1), date(2026, 8, 1))
    hi = [45.0 if d in ("2026-07-10", "2026-07-25") else 38.0 for d in dates]
    lo = [28.0] * len(dates)
    r = tree_year.sap_run(dates, hi, lo, date(2026, 8, 1), SOUTH)
    assert (r["winter"], r["window"], r["cycles"]) == ("2026", "1 Jun – 15 Nov", 2)


def test_after_the_southern_window_the_next_one_opens_in_june():
    dates = _days(date(2026, 6, 1), date(2026, 12, 1))
    hi = [45.0 if d == "2026-07-10" else 38.0 for d in dates]
    r = tree_year.sap_run(dates, hi, [28.0] * len(dates), date(2026, 12, 1), SOUTH)
    assert r["state"] == "over" and r["next_window_opens"] == "2027-06-01"


def test_a_northern_january_freeze_and_thaw_is_not_a_southern_sap_day():
    assert tree_year.sap_days(["2027-01-12"], [45.0], [28.0], SOUTH) == []
    assert tree_year.sap_days(["2027-01-12"], [45.0], [28.0], NORTH) == ["2027-01-12"]


# ── Soil ─────────────────────────────────────────────────────────────────


def test_a_southern_spring_warming_is_searched_from_august():
    d = _days(date(2026, 7, 1), date(2027, 6, 30))
    t = [65.0 if "2026-10-10" <= x <= "2027-03-31" else 50.0 for x in d]
    assert soil.crossing(d, t, 60.0, "warming", SOUTH) == "2026-10-10"
    assert soil.crossing(d, t, 60.0, "cooling", SOUTH) == "2027-04-01"


def test_a_southern_spring_season_stays_whole_across_the_new_year():
    seasons = soil.by_season(["2026-08-01", "2027-01-20", "2027-07-02"], [50.0, 70.0, 45.0], SOUTH)
    assert sorted(seasons) == [date(2026, 7, 1), date(2027, 7, 1)]
    assert seasons[date(2026, 7, 1)][0] == ["2026-08-01", "2027-01-20"]


def test_a_january_crossing_comes_after_the_october_ones_in_the_south():
    got = soil.typical_crossing(["2022-10-20", "2023-10-28", "2025-01-05"], SOUTH, date(2026, 7, 1))
    assert (got["earliest"], got["median"], got["latest"]) == ("2026-10-20", "2026-10-28", "2027-01-05")


def test_a_frost_date_is_placed_on_its_calendar_day_across_a_leap_year():
    seasons = frost.frost_free_seasons(
        _days(date(2023, 1, 1), date(2024, 12, 31)),
        [20.0 if d in ("2023-03-10", "2024-03-10") else 50.0
         for d in _days(date(2023, 1, 1), date(2024, 12, 31))],
        [2023, 2024], (7, 15),
    )
    got = frost.typical_around(date(2026, 7, 15), frost.offsets(seasons, "last_spring"))
    assert got["earliest"] == got["latest"] == "2026-03-10"


def test_the_plan_turns_to_next_season_once_the_reported_median_has_passed():
    """Ten seasons: the reported median is the mean of the middle two."""
    mid = date(2026, 7, 19)
    fall = [60, 70, 75, 80, 84, 86, 90, 95, 100, 105]   # median 85 days: Oct 12
    assert frost.typical_around(mid, fall)["median"] == "2026-10-12"
    assert planting.plan_season(mid, fall, date(2026, 10, 13)) == 2027
