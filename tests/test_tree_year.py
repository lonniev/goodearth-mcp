"""The tree year: spring dated for this ground, and the sap run.

The Spring Index figures in the fixtures are the ones measured live at Panton
VT on 2026-09-04 — leaf 101.3, bloom 139, normals 108 and 135.2 — so the
assertions here are against numbers that came off the service rather than off
a guess about it.
"""

from __future__ import annotations

from datetime import date, timedelta

from goodearth_mcp import tree_year

PANTON = {
    "first_leaf": 101.33333587646484,
    "first_bloom": 139.0,
    "normal_leaf": 108.0,
    "normal_bloom": 135.20741271972656,
}


# ── A raster value as a date ─────────────────────────────────────────────


def test_a_fractional_raster_value_rounds_to_a_day_a_grower_can_act_on():
    """101.33 is 11 April. Truncating would give 10 April and a third of a
    day nobody can do anything with."""
    assert tree_year.as_date(101.33333587646484, 2026) == "2026-04-11"


def test_day_one_is_the_first_of_january():
    assert tree_year.as_date(1, 2026) == "2026-01-01"


def test_a_value_outside_the_year_is_nodata_not_a_date():
    """The rasters carry a nodata sentinel, and reading one as December would
    put a confident leaf-out in the middle of winter."""
    for bad in (0, 367, -9999, 32767):
        assert tree_year.as_date(bad, 2026) is None


def test_no_value_is_no_date():
    assert tree_year.as_date(None, 2026) is None


def test_a_leap_year_counts_the_extra_day():
    assert tree_year.as_date(60, 2024) == "2024-02-29"
    assert tree_year.as_date(60, 2026) == "2026-03-01"


# ── Spring, against its own normal ───────────────────────────────────────


def test_panton_leafed_out_seven_days_early_this_year():
    sp = tree_year.spring(PANTON, 2026)
    assert sp["first_leaf"]["on"] == "2026-04-11"
    assert sp["first_leaf"]["normally"] == "2026-04-18"
    assert sp["first_leaf"]["days_from_normal"] == -7


def test_early_is_negative_and_late_is_positive():
    """The sign is the whole reading. Inverting it would report every early
    spring as late and still look plausible."""
    sp = tree_year.spring(PANTON, 2026)
    assert sp["first_leaf"]["days_from_normal"] < 0     # 101 vs 108: early
    assert sp["first_bloom"]["days_from_normal"] > 0    # 139 vs 135: late


def test_a_missing_normal_still_dates_this_year():
    sp = tree_year.spring({**PANTON, "normal_leaf": None}, 2026)
    assert sp["first_leaf"]["on"] == "2026-04-11"
    assert sp["first_leaf"]["normally"] is None
    assert "days_from_normal" not in sp["first_leaf"]


def test_nothing_at_all_is_reported_as_absent_rather_than_as_a_date():
    sp = tree_year.spring(dict.fromkeys(PANTON), 2026)
    assert sp["first_leaf"]["on"] is None
    assert "No spring index" in tree_year.spring_note(sp)


def test_the_note_says_early_or_late_in_days():
    assert "7 days early" in tree_year.spring_note(tree_year.spring(PANTON, 2026))


def test_arriving_on_the_normal_is_said_as_that_and_not_as_zero_days():
    sp = tree_year.spring({**PANTON, "first_leaf": 108.0}, 2026)
    assert "on its thirty-year normal" in tree_year.spring_note(sp)


# ── The sap run ──────────────────────────────────────────────────────────


def series(pairs: list[tuple[str, float, float]]):
    return ([p[0] for p in pairs], [p[1] for p in pairs], [p[2] for p in pairs])


def test_a_day_that_freezes_and_thaws_is_a_sap_day():
    d, hi, lo = series([("2026-03-05", 45.0, 24.0)])
    assert tree_year.sap_days(d, hi, lo) == ["2026-03-05"]


def test_a_night_that_does_not_freeze_is_not():
    """Both halves are required. Sap moves on the pressure a freeze builds;
    a mild night moves nothing however warm the afternoon."""
    d, hi, lo = series([("2026-03-05", 55.0, 36.0)])
    assert tree_year.sap_days(d, hi, lo) == []


def test_a_day_that_never_thaws_is_not():
    d, hi, lo = series([("2026-02-05", 28.0, 5.0)])
    assert tree_year.sap_days(d, hi, lo) == []


def test_a_freeze_and_thaw_in_november_is_not_the_start_of_a_season():
    d, hi, lo = series([("2026-11-05", 48.0, 25.0)])
    assert tree_year.sap_days(d, hi, lo) == []


def _run(days: list[str], today: date):
    """A year of record with a freeze-thaw on each named day."""
    rows = []
    d = date(today.year, 1, 1)
    while d <= date(today.year, 12, 31):
        iso = d.isoformat()
        rows.append((iso, 45.0, 24.0) if iso in days else (iso, 50.0, 38.0))
        d += timedelta(days=1)
    return series(rows)


def test_a_run_in_progress_reports_when_it_started_and_how_many_days():
    today = date(2026, 3, 20)
    d, hi, lo = _run(["2026-03-08", "2026-03-12", "2026-03-18"], today)
    r = tree_year.sap_run(d, hi, lo, today)
    assert r["state"] == "running"
    assert r["started_on"] == "2026-03-08"
    assert r["cycles"] == 3
    assert r["last_cycle_on"] == "2026-03-18"


def test_a_run_gone_quiet_for_a_fortnight_is_over():
    today = date(2026, 4, 5)
    d, hi, lo = _run(["2026-03-08", "2026-03-12"], today)
    assert tree_year.sap_run(d, hi, lo, today)["state"] == "over"


def test_asking_in_august_does_not_dress_last_spring_as_now():
    """THE LOAD-BEARING CASE. The arithmetic is just as true in August, and
    reporting "running" then would send someone to hang buckets."""
    today = date(2026, 8, 20)
    d, hi, lo = _run(["2026-03-08", "2026-03-12"], today)
    assert tree_year.sap_run(d, hi, lo, today)["state"] == "over"


def test_before_the_window_is_not_started_rather_than_none():
    """"Nothing yet" and "this ground did not run" are different claims."""
    today = date(2026, 1, 5)
    d, hi, lo = _run([], today)
    assert tree_year.sap_run(d, hi, lo, today)["state"] == "not_started"


def test_past_the_window_with_no_cycle_says_none_recorded():
    today = date(2026, 6, 1)
    d, hi, lo = _run([], today)
    assert tree_year.sap_run(d, hi, lo, today)["state"] == "none_recorded"


def test_last_years_run_is_not_this_year_s():
    """The record spans a decade; only the current year is the answer."""
    today = date(2026, 3, 20)
    d, hi, lo = _run(["2026-03-08"], today)
    d = ["2025-03-09", *d]
    hi = [45.0, *hi]
    lo = [24.0, *lo]
    assert tree_year.sap_run(d, hi, lo, today)["cycles"] == 1


def test_a_year_the_record_does_not_cover_is_none_not_a_zero_run():
    d, hi, lo = _run(["2026-03-08"], date(2026, 3, 20))
    assert tree_year.sap_run(d, hi, lo, date(2030, 3, 20)) is None


def test_a_missing_reading_is_skipped_rather_than_read_as_freezing():
    d, hi, lo = series([("2026-03-05", 45.0, 24.0), ("2026-03-06", 45.0, 24.0)])
    lo = [None, 24.0]
    assert tree_year.sap_days(d, hi, lo) == ["2026-03-06"]


# ── Who has anything to tap ──────────────────────────────────────────────


def test_only_the_trees_a_sugarmaker_taps_bring_up_the_sap_section():
    assert tree_year.taps(["Maple · sugar", "Apple", "Birch · paper"]) == [
        "Maple · sugar", "Birch · paper"]


def test_a_block_with_no_tappable_tree_gets_no_sap_answer():
    """The arithmetic would be just as true and would answer a question
    nobody on that ground asked."""
    assert tree_year.taps(["Apple", "Pear · European", "Peony"]) == []
