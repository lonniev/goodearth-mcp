"""Pest models — validation, stage assessment, and scouting priority."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from goodearth_mcp import pests

TODAY = date(2026, 8, 30)
DS = [(date(2026, 1, 1) + timedelta(days=i)).isoformat() for i in range(242)]
CUM = [round(i * 10.0, 1) for i in range(242)]


def model(**kw):
    base = {"pest": "Aster leafhopper", "base_temp": 50,
            "stages": [{"stage": "second flight", "gdd": 1850}]}
    base.update(kw)
    return base


# ── Validation ───────────────────────────────────────────────────────────


def test_valid_model_normalizes_and_sorts_stages():
    m = pests.validate_model(model(stages=[
        {"stage": "third", "gdd": 2400}, {"stage": "second", "gdd": 1850}]))
    assert [s["stage"] for s in m["stages"]] == ["second", "third"]


@pytest.mark.parametrize("bad", [None, "leafhopper", 7, [], {}])
def test_non_object_models_are_rejected(bad):
    with pytest.raises(pests.PestError):
        pests.validate_model(bad)


def test_missing_name_is_rejected():
    with pytest.raises(pests.PestError):
        pests.validate_model({"stages": [{"stage": "x", "gdd": 100}]})


def test_missing_stages_are_rejected():
    with pytest.raises(pests.PestError):
        pests.validate_model(model(stages=[]))


@pytest.mark.parametrize("g", [0, -100, 99_999, "many", None])
def test_absurd_stage_gdd_is_rejected(g):
    with pytest.raises(pests.PestError):
        pests.validate_model(model(stages=[{"stage": "x", "gdd": g}]))


def test_celsius_base_temp_is_rejected():
    with pytest.raises(pests.PestError):
        pests.validate_model(model(base_temp=10))


def test_bad_biofix_is_rejected():
    with pytest.raises(pests.PestError):
        pests.validate_model(model(biofix="springtime"))


def test_too_many_stages_are_rejected():
    with pytest.raises(pests.PestError):
        pests.validate_model(model(stages=[{"stage": f"s{i}", "gdd": i + 1} for i in range(20)]))


# ── Biofix ───────────────────────────────────────────────────────────────


def test_no_biofix_counts_the_whole_season():
    acc = pests.accumulated_from_biofix(DS, CUM, None)
    assert acc[0] == CUM[-1]


def test_biofix_rebases_the_count():
    bf = date(2026, 5, 1)
    acc = pests.accumulated_from_biofix(DS, CUM, bf)
    assert acc[0] == pytest.approx(CUM[-1] - CUM[DS.index("2026-05-01")])
    assert acc[1] == "2026-05-01"


def test_a_biofix_after_the_record_has_not_started():
    assert pests.accumulated_from_biofix(DS, CUM, date(2027, 5, 1)) is None


# ── Assessment ───────────────────────────────────────────────────────────


def test_crossed_stages_are_marked_and_the_next_is_projected():
    m = pests.validate_model(model(stages=[
        {"stage": "second flight", "gdd": 1850}, {"stage": "third flight", "gdd": 2600}]))
    a = pests.assess(m, DS, CUM, rate=10.0)
    assert a["current_stage"] == "second flight"
    assert a["next_stage"]["stage"] == "third flight"
    assert a["next_stage"]["projected_date"] is not None


def test_a_model_below_its_first_stage_says_so():
    m = pests.validate_model(model(stages=[{"stage": "flight", "gdd": 5000}]))
    a = pests.assess(m, DS, CUM, rate=10.0)
    assert a["state"] == "before_first_stage"
    assert a["current_stage"] is None


def test_no_rate_means_no_projected_date():
    """A stalled season must not produce a confident scouting date."""
    m = pests.validate_model(model(stages=[{"stage": "flight", "gdd": 5000}]))
    a = pests.assess(m, DS, CUM, rate=0.0)
    assert a["stages"][0]["projected_date"] is None


def test_the_note_disclaims_the_entomology():
    a = pests.assess(pests.validate_model(model()), DS, CUM, 10.0)
    assert "extension" in a["note"]


def test_a_biofix_after_the_record_is_a_state_not_an_error():
    m = pests.validate_model(model(biofix="2027-05-01"))
    assert pests.assess(m, DS, CUM, 10.0)["state"] == "not_started"


# ── Scouting priority ────────────────────────────────────────────────────


def test_a_stage_arriving_soon_is_worth_walking():
    a = [{"pest": "X", "state": "before_first_stage",
          "next_stage": {"stage": "flight", "projected_date": (TODAY + timedelta(days=4)).isoformat()}}]
    assert pests.scouting_priority(a, TODAY) == ["X — flight in about 4 days"]


def test_a_stage_far_out_is_not():
    a = [{"pest": "X", "state": "before_first_stage",
          "next_stage": {"stage": "flight", "projected_date": (TODAY + timedelta(days=60)).isoformat()}}]
    assert pests.scouting_priority(a, TODAY) == []


def test_a_stage_crossed_this_week_is_worth_walking():
    a = [{"pest": "X", "state": "active", "current_stage": "peak flight", "next_stage": None,
          "stages": [{"stage": "peak flight", "reached": True,
                      "crossed_on": (TODAY - timedelta(days=3)).isoformat()}]}]
    assert pests.scouting_priority(a, TODAY) == ["X — peak flight 3 days ago"]


def test_a_stage_crossed_in_june_is_not_something_to_watch_for_now():
    """THE LOAD-BEARING NEGATIVE ASSERTION.

    `state == "active"` never expires. This list is headed "active now", and a
    cabbage maggot that cleared its last stage four months ago is not.
    """
    a = [{"pest": "X", "state": "active", "current_stage": "peak flight", "next_stage": None,
          "stages": [{"stage": "peak flight", "reached": True,
                      "crossed_on": (TODAY - timedelta(days=120)).isoformat()}]}]
    assert pests.scouting_priority(a, TODAY) == []


def test_a_pest_both_just_past_and_nearly_due_gets_ONE_line():
    """The count under this list is a count of pests, so a pest is one line."""
    a = [{"pest": "X", "state": "active", "current_stage": "first flight",
          "next_stage": {"stage": "second flight",
                         "projected_date": (TODAY + timedelta(days=6)).isoformat()},
          "stages": [{"stage": "first flight", "reached": True,
                      "crossed_on": (TODAY - timedelta(days=1)).isoformat()}]}]
    assert pests.scouting_priority(a, TODAY) == [
        "X — first flight yesterday · second flight in about 6 days"]


def test_the_latest_crossing_is_the_one_named():
    a = [{"pest": "X", "state": "active", "next_stage": None, "stages": [
        {"stage": "first flight", "reached": True,
         "crossed_on": (TODAY - timedelta(days=9)).isoformat()},
        {"stage": "second flight", "reached": True,
         "crossed_on": (TODAY - timedelta(days=2)).isoformat()},
    ]}]
    assert pests.scouting_priority(a, TODAY) == ["X — second flight 2 days ago"]


def test_a_watch_row_with_no_stages_is_never_listed():
    """A vole has no degree-day stage to cross, and inventing one for it is
    exactly what `watch: true` exists to avoid."""
    a = [{"pest": "Vole", "state": "before_first_stage", "next_stage": None, "stages": []}]
    assert pests.scouting_priority(a, TODAY) == []


# ── Crossing dates ───────────────────────────────────────────────────────


def test_a_reached_stage_carries_the_day_it_arrived():
    """Without a date, "reached" reads the same on the day it happens and four
    months later — which is the whole bug the scouting list had."""
    m = pests.validate_model(model(stages=[{"stage": "second flight", "gdd": 1850}]))
    a = pests.assess(m, DS, CUM, rate=10.0)
    # CUM is 10 GDD/day from Jan 1, so 1850 lands on day 185.
    assert a["stages"][0]["crossed_on"] == DS[185]


def test_an_unreached_stage_has_no_crossing_date():
    m = pests.validate_model(model(stages=[{"stage": "flight", "gdd": 5000}]))
    assert pests.assess(m, DS, CUM, rate=10.0)["stages"][0]["crossed_on"] is None


def test_a_crossing_is_dated_from_the_biofix_not_from_january():
    """The biofix rebases the count, so it must rebase the date too."""
    m = pests.validate_model(model(biofix="2026-05-01",
                                   stages=[{"stage": "flight", "gdd": 100}]))
    a = pests.assess(m, DS, CUM, rate=10.0)
    assert a["stages"][0]["crossed_on"] == "2026-05-11"  # ten days at 10/day


def test_nothing_pending_is_an_empty_list_not_none():
    assert pests.scouting_priority([], TODAY) == []
