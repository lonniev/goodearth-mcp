"""A grower's season does not end on Dec 31."""

from __future__ import annotations

from datetime import date

from goodearth_mcp import block_store, seasons, task_store

# ── Calibration ──────────────────────────────────────────────────────────


def test_a_december_report_still_calibrates_in_january():
    rows = [{"observed_on": "2026-12-10"}, {"observed_on": "2027-01-04"},
            {"observed_on": "2025-11-01"}]
    kept = seasons.recent_observations(rows, None, date(2027, 1, 15))
    assert [o["observed_on"] for o in kept] == ["2026-12-10", "2027-01-04"]


def test_a_named_season_is_that_season_only():
    rows = [{"observed_on": "2026-12-10"}, {"observed_on": "2027-01-04"}]
    assert seasons.recent_observations(rows, 2026, date(2027, 1, 15)) == [{"observed_on": "2026-12-10"}]


# ── The calendar feed ────────────────────────────────────────────────────

JAN1 = date(2027, 1, 1)


def test_a_clutch_set_in_december_is_still_in_januarys_feed():
    hen = {"species": "Domestic chicken", "event": "eggs hatch", "driver": "interval",
           "from": "2026-12-20", "days": 21, "season_year": 2026}
    assert seasons.feed_rows("wildlife", [hen], JAN1) == [hen]


def test_an_annual_roster_is_carried_into_the_new_year():
    heron = {"species": "Great blue heron", "event": "arrives", "typical_on": "04-02", "season_year": 2026}
    borer = {"pest": "Squash vine borer", "season_year": 2026}
    assert seasons.feed_rows("wildlife", [heron], JAN1) == [heron]
    assert seasons.feed_rows("pest", [borer], JAN1) == [borer]


def test_last_summers_plantings_do_not_come_back_as_phantoms():
    old = {"crop": "Zinnia", "set_out": "2026-06-01", "gdd_target": 1200}
    new = {"crop": "Onion", "set_out": "2027-01-15", "gdd_target": 1400}
    bare = {"crop": "Apple"}
    assert seasons.feed_rows("planting", [old, new, bare], JAN1) == [new, bare]


def test_last_years_biofix_does_not_date_this_years_pest():
    old = {"pest": "Codling moth", "biofix": "2026-05-10"}
    new = {"pest": "Codling moth", "biofix": "2027-05-08"}
    assert seasons.feed_rows("pest", [old, new], JAN1) == [new]


# ── Which season a saved row belongs to ──────────────────────────────────


def test_a_row_belongs_to_the_season_of_its_own_date():
    """An onion saved in November to go out in January is next season's."""
    assert block_store.season_for("2027-01-15", 2026) == 2027
    assert block_store.season_for(None, 2026) == 2026
    assert block_store.season_for("sometime in April", 2026) == 2026


# ── Tasks ────────────────────────────────────────────────────────────────


def test_this_seasons_tasks_include_next_january():
    """In November, a task due Jan 5 is this season's. The window was Jan 1 to
    Dec 31 of the calendar year, which hid it — and kept it out of the feed."""
    lo, hi = task_store.window_for("season", date(2026, 11, 15))
    assert lo <= date(2026, 11, 15) <= hi
    assert lo <= date(2027, 1, 5) <= hi


def test_a_stated_season_start_runs_a_year_from_it():
    lo, hi = task_store.window_for("season", date(2026, 11, 15), season_start=date(2026, 4, 15))
    assert (lo, hi) == (date(2026, 4, 15), date(2027, 4, 14))
