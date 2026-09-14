"""Winter crops are counted by the winter, not the calendar year.

Sap runs from a December thaw to the May bud-break; chill banks from November
to February; the coldest night of a winter can fall in October or March. Each
of these was read by the calendar year, and each broke at New Year.
"""

from __future__ import annotations

from datetime import date, timedelta

from goodearth_mcp import chill, perennial, tree_year


def _record(start: date, end: date, sap: list[str]):
    """A mild record from start to end, with a freeze-and-thaw on each named day."""
    dates, hi, lo = [], [], []
    d = start
    while d <= end:
        iso = d.isoformat()
        dates.append(iso)
        hi.append(45.0 if iso in sap else 50.0)
        lo.append(24.0 if iso in sap else 38.0)
        d += timedelta(days=1)
    return dates, hi, lo


# ── The sap winter ───────────────────────────────────────────────────────


def test_the_sap_winter_runs_from_december_to_may_and_is_named_by_its_end():
    w = (date(2026, 12, 1), date(2027, 5, 15))
    assert tree_year.sap_winter(date(2026, 12, 20)) == w
    assert tree_year.sap_winter(date(2027, 1, 15)) == w
    assert tree_year.sap_winter(date(2027, 8, 1)) == w


def test_a_december_thaw_is_a_sap_day():
    """Early tapping: taps in December for a January run."""
    today = date(2026, 12, 20)
    r = tree_year.sap_run(*_record(date(2026, 1, 1), today, ["2026-12-18"]), today)
    assert (r["state"], r["started_on"], r["cycles"], r["winter"]) == ("running", "2026-12-18", 1, "2026–27")


def test_a_run_begun_in_december_carries_into_january():
    today = date(2027, 1, 15)
    r = tree_year.sap_run(*_record(date(2026, 12, 1), today, ["2026-12-18", "2027-01-12"]), today)
    assert r["started_on"] == "2026-12-18"
    assert r["cycles"] == 2


def test_a_hard_january_freeze_pauses_the_run_rather_than_ending_it():
    today = date(2027, 2, 10)
    r = tree_year.sap_run(*_record(date(2026, 12, 1), today, ["2026-12-18", "2027-01-10"]), today)
    assert r["state"] == "paused"


def test_a_quiet_fortnight_in_april_is_the_end():
    today = date(2027, 4, 20)
    r = tree_year.sap_run(*_record(date(2026, 12, 1), today, ["2027-03-08", "2027-03-30"]), today)
    assert r["state"] == "over"


def test_an_open_window_with_no_sap_day_yet_says_so():
    """On Jan 15 with no cycle yet the section used to vanish."""
    today = date(2027, 1, 15)
    r = tree_year.sap_run(*_record(date(2026, 12, 1), today, []), today)
    assert r["state"] == "not_started"
    assert "Dec 1" in r["note"]


def test_between_winters_the_run_is_last_winters_and_says_when_the_next_opens():
    today = date(2027, 8, 20)
    r = tree_year.sap_run(*_record(date(2026, 12, 1), today, ["2027-02-20", "2027-03-15"]), today)
    assert (r["state"], r["winter"], r["next_window_opens"]) == ("over", "2026–27", "2027-12-01")


# ── Chill ────────────────────────────────────────────────────────────────


def test_a_winter_still_under_way_is_not_scored_as_whole():
    """From early January the winter in progress had enough days to pass as
    whole, and was counted as one that fell short."""
    dates, hi, lo = _record(date(2026, 10, 1), date(2027, 1, 15), [])
    winters = chill.banked(dates, hi, lo)
    assert any(w["winter"] == 2027 for w in winters)
    assert not [w for w in winters if chill.finished(w, date(2027, 1, 15))]
    assert chill.finished({"winter": 2027}, date(2027, 2, 15))


# ── The coldest night ────────────────────────────────────────────────────


def test_an_october_freeze_belongs_to_the_coming_winter():
    lows = perennial.winter_lows(["2026-10-20", "2027-01-05"], [20.0, 10.0])
    assert lows == [{"winter": 2027, "low_f": 10.0, "on": "2027-01-05"}]
    assert perennial.winter_lows(["2026-10-20"], [20.0])[0]["winter"] == 2027
