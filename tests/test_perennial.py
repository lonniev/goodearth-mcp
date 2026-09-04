"""Will a tree live here, and will it fruit here.

Both answers are FREQUENCIES across the record, not verdicts on an average —
a tree that survives nine winters in ten is a different proposition from one
that survives five, and an average hides the difference. These tests exist
mostly to hold that shape.
"""

from __future__ import annotations

import pytest

from goodearth_mcp import perennial


def tree(**kw):
    base = {"tree": "Honeycrisp apple", "chill_hours": 800, "hardy_to_f": -30}
    base.update(kw)
    return base


# ── Validation ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("bad", [None, "apple", 7, [], {}])
def test_a_tree_that_is_not_an_object_is_rejected(bad):
    with pytest.raises(perennial.PerennialError):
        perennial.validate_tree(bad)


def test_a_tree_needs_a_name():
    with pytest.raises(perennial.PerennialError):
        perennial.validate_tree({"chill_hours": 800})


def test_a_tree_with_NEITHER_figure_is_still_a_valid_row():
    """"There is a hedgerow of black cherry along the north line" is a true
    thing to record. Demanding a chill requirement for it would invite exactly
    the fabricated number this service refuses to publish."""
    t = perennial.validate_tree({"tree": "Black cherry"})
    assert t["tree"] == "Black cherry"
    assert t["chill_hours"] is None
    assert t["hardy_to_f"] is None


@pytest.mark.parametrize("bad", [-1, 9_000, "many"])
def test_an_absurd_chill_requirement_is_rejected(bad):
    with pytest.raises(perennial.PerennialError):
        perennial.validate_tree(tree(chill_hours=bad))


@pytest.mark.parametrize("bad", [-100, 120, "cold"])
def test_an_absurd_hardiness_limit_is_rejected(bad):
    with pytest.raises(perennial.PerennialError):
        perennial.validate_tree(tree(hardy_to_f=bad))


def test_a_celsius_hardiness_limit_lands_inside_the_range_and_is_NOT_caught():
    """Honest about a limit of the guard: -20 is a plausible °F figure and a
    plausible °C one, so the range cannot tell them apart. The field is named
    hardy_to_f and every surface says °F; this test records that the check is
    a range check and not a units check."""
    assert perennial.validate_tree(tree(hardy_to_f=-20))["hardy_to_f"] == -20.0


def test_a_name_arrives_under_any_of_the_three_keys():
    for key in ("tree", "crop", "name"):
        assert perennial.validate_tree({key: "Pear"})["tree"] == "Pear"


# ── Winter lows ──────────────────────────────────────────────────────────


def test_the_coldest_night_is_found_per_winter_across_the_year_boundary():
    dates = ["2025-12-20", "2026-01-10", "2026-02-05", "2026-12-15"]
    tmin = [-5.0, -22.0, -8.0, -12.0]
    lows = perennial.winter_lows(dates, tmin)
    assert [w["winter"] for w in lows] == [2026, 2027]
    assert lows[0]["low_f"] == -22.0
    assert lows[0]["on"] == "2026-01-10"


def test_march_counts_toward_hardiness_though_it_does_not_count_toward_chill():
    """The coldest night of the year is often past the chill window, and it
    kills a tree just the same."""
    lows = perennial.winter_lows(["2026-02-01", "2026-03-05"], [-10.0, -25.0])
    assert lows[0]["low_f"] == -25.0


def test_a_summer_night_is_not_the_answer_to_how_cold_it_gets_here():
    lows = perennial.winter_lows(["2026-01-05", "2026-07-04"], [-10.0, 48.0])
    assert len(lows) == 1
    assert lows[0]["low_f"] == -10.0


def test_a_missing_low_is_skipped_rather_than_read_as_zero():
    lows = perennial.winter_lows(["2026-01-05", "2026-01-06"], [None, -3.0])
    assert lows[0]["low_f"] == -3.0


# ── Hardiness ────────────────────────────────────────────────────────────


def _lows(*vals: float) -> list[dict]:
    return [{"winter": 2016 + i, "low_f": v, "on": f"{2016 + i}-01-15"}
            for i, v in enumerate(vals)]


def test_a_tree_no_winter_touched_is_hardy():
    h = perennial.hardiness(_lows(-20.0, -18.0, -25.0), -30.0)
    assert h["verdict"] == "hardy"
    assert h["winters_below"] == 0
    assert "No winter in 3" in h["note"]


def test_citrus_in_vermont_is_too_cold_and_says_by_how_much():
    """THE LOAD-BEARING CASE. If this ever answers anything but too_cold, the
    arithmetic is inverted and every other verdict is untrustworthy."""
    h = perennial.hardiness(_lows(-20.0, -18.0, -25.0, -12.0), 26.0)
    assert h["verdict"] == "too_cold"
    assert h["winters_below"] == 4
    assert h["coldest_margin_f"] == -51.0


def test_one_winter_in_ten_is_marginal_rather_than_ruled_out():
    lows = _lows(*([-20.0] * 9), -35.0)
    h = perennial.hardiness(lows, -30.0)
    assert h["verdict"] == "marginal"
    assert h["winters_below"] == 1


def test_two_winters_in_ten_is_risky_rather_than_marginal():
    lows = _lows(*([-20.0] * 8), -35.0, -33.0)
    assert perennial.hardiness(lows, -30.0)["verdict"] == "risky"


def test_no_hardiness_figure_is_UNRATED_and_still_reports_the_record():
    h = perennial.hardiness(_lows(-20.0, -31.0), None)
    assert h["verdict"] == "unrated"
    assert h["record_low_f"] == -31.0


def test_no_record_is_unknown_rather_than_hardy():
    assert perennial.hardiness([], -30.0)["verdict"] == "unknown"


# ── Chill delivery ───────────────────────────────────────────────────────


def _winters(*hours: float) -> list[dict]:
    return [{"winter": 2016 + i, "hours": h, "days": 107, "gaps": 0,
             "from": f"{2015 + i}-11-01", "to": f"{2016 + i}-02-15"}
            for i, h in enumerate(hours)]


def test_chill_met_every_winter_is_reliable():
    c = perennial.chill_delivery(_winters(1200.0, 1300.0, 1100.0), 800.0)
    assert c["verdict"] == "reliable"
    assert c["winters_meeting"] == 3


def test_chill_met_in_half_the_winters_is_marginal_not_met():
    c = perennial.chill_delivery(_winters(700.0, 900.0, 950.0, 600.0), 850.0)
    assert c["winters_meeting"] == 2
    assert c["verdict"] == "marginal"


def test_chill_almost_never_met_is_short():
    c = perennial.chill_delivery(_winters(300.0, 350.0, 900.0, 200.0), 800.0)
    assert c["verdict"] == "short"


def test_the_note_gives_the_median_AND_the_lowest_not_just_the_count():
    c = perennial.chill_delivery(_winters(900.0, 1000.0, 1100.0), 800.0)
    assert "median" in c["note"]
    assert "lowest" in c["note"]


def test_no_requirement_is_unrated_and_still_reports_what_the_ground_banked():
    c = perennial.chill_delivery(_winters(900.0, 1100.0), None)
    assert c["verdict"] == "unrated"
    assert c["median_hours"] == 1000.0


# ── Assembly and ordering ────────────────────────────────────────────────


def test_assess_answers_both_questions_for_one_tree():
    a = perennial.assess(
        perennial.validate_tree(tree()), _winters(1200.0, 1100.0), _lows(-20.0, -22.0)
    )
    assert a["tree"] == "Honeycrisp apple"
    assert a["hardiness"]["verdict"] == "hardy"
    assert a["chill"]["verdict"] == "reliable"


def test_a_tree_that_will_not_live_here_sorts_above_one_that_will_not_fruit():
    """Hardiness outranks chill: a tree that dies does not need its fruit set
    discussed."""
    winters, lows = _winters(300.0, 320.0), _lows(-20.0, -22.0)
    rows = [
        perennial.assess(perennial.validate_tree(
            {"tree": "Low chill", "chill_hours": 900, "hardy_to_f": -40}), winters, lows),
        perennial.assess(perennial.validate_tree(
            {"tree": "Too cold", "chill_hours": 100, "hardy_to_f": 20}), winters, lows),
    ]
    rows.sort(key=perennial.sort_key)
    assert [r["tree"] for r in rows] == ["Too cold", "Low chill"]


def test_an_unrated_tree_sorts_below_a_judged_one_rather_than_at_the_top():
    winters, lows = _winters(1200.0), _lows(-20.0)
    rows = [
        perennial.assess(perennial.validate_tree({"tree": "Unrated"}), winters, lows),
        perennial.assess(perennial.validate_tree(
            {"tree": "Judged", "hardy_to_f": 20}), winters, lows),
    ]
    rows.sort(key=perennial.sort_key)
    assert [r["tree"] for r in rows] == ["Judged", "Unrated"]
