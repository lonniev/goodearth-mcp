"""Task querying — the parts that decide a page, and the one that decides safety."""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import task_store as ts


# ── Sorting is a whitelist, not a string ─────────────────────────────────


def test_a_sort_column_never_reaches_the_sql():
    """The caller's sort_col indexes a map; it is never interpolated.

    This is the property that stops a sort parameter becoming an injection,
    and it is why an unknown column must fall back rather than raise: a bad
    sort should give the default order, not a 500.
    """
    assert ts.SORTABLE.get("due; DROP TABLE goodearth_tasks; --") is None
    assert ts.SORTABLE.get("due; DROP TABLE goodearth_tasks; --", ts.SORTABLE[ts.DEFAULT_SORT]) == "due"


def test_every_sortable_column_maps_to_a_bare_expression():
    """Nothing in the map may carry a semicolon or a comment marker.

    A whitelist only protects what is IN it — a hostile entry added later
    would pass straight through to ORDER BY.
    """
    for key, expr in ts.SORTABLE.items():
        assert ";" not in expr and "--" not in expr, key


def test_the_default_sort_is_itself_sortable():
    assert ts.DEFAULT_SORT in ts.SORTABLE


# ── Timeframes ───────────────────────────────────────────────────────────

TODAY = date(2026, 9, 1)          # a Tuesday
SEASON = date(2026, 4, 15)


def test_day_is_just_today():
    assert ts.window_for("day", TODAY) == (TODAY, TODAY)


def test_week_runs_monday_to_sunday():
    lo, hi = ts.window_for("week", TODAY)
    assert (lo, hi) == (date(2026, 8, 31), date(2026, 9, 6))
    assert lo.weekday() == 0 and hi.weekday() == 6


def test_month_covers_the_whole_calendar_month():
    assert ts.window_for("month", TODAY) == (date(2026, 9, 1), date(2026, 9, 30))


def test_month_end_is_found_rather_than_assumed_to_be_30():
    assert ts.window_for("month", date(2026, 2, 10))[1] == date(2026, 2, 28)
    assert ts.window_for("month", date(2024, 2, 10))[1] == date(2024, 2, 29)


def test_season_is_the_farms_season_not_a_calendar_quarter():
    """A grower asking what is due this season means THEIR season."""
    assert ts.window_for("season", TODAY, season_start=SEASON)[0] == SEASON


def test_all_has_no_window():
    assert ts.window_for("all", TODAY) is None


def test_an_unknown_timeframe_is_refused_rather_than_silently_widened():
    # Falling back to "all" would answer a question nobody asked, and the
    # caller would never learn their filter did nothing.
    with pytest.raises(ts.TaskError):
        ts.window_for("fortnight", TODAY)


# ── Paging ───────────────────────────────────────────────────────────────


def test_page_size_is_capped():
    assert ts.page_bounds(0, 10_000)[1] == ts.MAX_PAGE_SIZE


def test_page_size_is_never_zero():
    assert ts.page_bounds(0, 0)[1] >= 1


def test_a_negative_page_is_clamped_to_the_first():
    assert ts.page_bounds(-5, 20)[0] == 0


# ── Search ───────────────────────────────────────────────────────────────


def test_an_overlong_pattern_is_refused():
    """The pattern reaches Postgres' regex engine, so its length is bounded."""
    with pytest.raises(ts.TaskError):
        ts.clean_search("a" * (ts.MAX_SEARCH_LEN + 1))


def test_an_ordinary_pattern_passes_through_unaltered():
    assert ts.clean_search("  cover|mulch  ") == "cover|mulch"


def test_an_empty_search_is_not_a_pattern():
    assert ts.clean_search("") == ""
