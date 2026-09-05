"""An event the grower defines, dated by what this ground's weather did.

The salamanders' "Big Night" is the case that asked for it — the first mild wet
night after the ground thaws. No catalogue holds it, no degree-day total finds
it, and USA-NPN has never heard of it. Before this, the only honest answer was
to skip the row.

The definition lives in the RECORD, so it belongs to the grower and re-dates
itself every season, rather than being remembered by whichever agent last
helped and re-invented by the next one.
"""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import wildlife

BIG_NIGHT = {
    "species": "Spotted salamander", "event": "Big Night crossing",
    "driver": "condition",
    "trigger": {"after": "03-01", "min_night_f": 40, "wet": True},
}

TODAY = date(2026, 9, 4)


def series(rows: list[tuple[str, float, float, float]]):
    return ([r[0] for r in rows], [r[1] for r in rows],
            [r[2] for r in rows], [r[3] for r in rows])


# ── What a trigger may say ───────────────────────────────────────────────


def test_the_owners_example_validates_as_written():
    ev = wildlife.validate_event(BIG_NIGHT)
    assert ev["driver"] == "condition"
    assert ev["trigger"] == {"after": "03-01", "min_night_f": 40.0, "wet": True}


def test_a_condition_event_needs_a_trigger():
    with pytest.raises(wildlife.WildlifeError):
        wildlife.validate_event({"species": "X", "event": "e", "driver": "condition"})


def test_a_trigger_of_only_a_date_is_a_calendar_event_wearing_a_costume():
    """It would report the day after `after` every year whatever the weather
    did, which is what the calendar driver already does honestly."""
    with pytest.raises(wildlife.WildlifeError):
        wildlife.validate_event({"species": "X", "event": "e", "driver": "condition",
                                 "trigger": {"after": "03-01"}})


def test_a_condition_this_service_cannot_check_is_REFUSED_not_ignored():
    """THE LOAD-BEARING ONE. Silently dropping `min_snow_in` would date the
    first mild wet night rather than the first mild wet night without snow —
    a wrong answer that looks exactly like a right one."""
    with pytest.raises(wildlife.WildlifeError) as e:
        wildlife.validate_event({"species": "X", "event": "e", "driver": "condition",
                                 "trigger": {"min_night_f": 40, "min_snow_in": 2}})
    assert "min_snow_in" in str(e.value)


@pytest.mark.parametrize("bad", [{"min_night_f": -100}, {"min_night_f": 200},
                                 {"min_night_f": "mild"}, {"after": "springtime"}])
def test_an_implausible_trigger_is_refused(bad):
    with pytest.raises(wildlife.WildlifeError):
        wildlife.validate_event({"species": "X", "event": "e",
                                 "driver": "condition", "trigger": bad})


def test_a_trigger_must_be_an_object_not_a_sentence():
    with pytest.raises(wildlife.WildlifeError):
        wildlife.validate_event({"species": "X", "event": "e", "driver": "condition",
                                 "trigger": "the first warm rain"})


# ── What it dates ────────────────────────────────────────────────────────


def test_it_finds_the_first_day_this_ground_met_the_conditions():
    ev = wildlife.validate_event(BIG_NIGHT)
    d, hi, lo, rain = series([
        ("2026-02-20", 50.0, 44.0, 0.4),   # warm and wet, but before `after`
        ("2026-03-05", 48.0, 38.0, 0.5),   # wet, night too cold
        ("2026-03-09", 55.0, 43.0, 0.0),   # mild, dry
        ("2026-03-14", 52.0, 41.0, 0.3),   # both — this is the night
        ("2026-03-20", 60.0, 45.0, 0.6),
    ])
    got = wildlife.condition_event(ev, d, hi, lo, rain, TODAY)
    assert got["reached_on"] == "2026-03-14"


def test_after_is_honoured_so_a_february_thaw_is_not_the_answer():
    """A warm wet night in February happens and is not Big Night. The date
    floor is what makes the trigger about the season rather than the weather."""
    ev = wildlife.validate_event(BIG_NIGHT)
    d, hi, lo, rain = series([("2026-02-20", 55.0, 45.0, 0.5),
                              ("2026-03-14", 52.0, 41.0, 0.3)])
    assert wildlife.condition_event(ev, d, hi, lo, rain, TODAY)["reached_on"] == "2026-03-14"


def test_a_season_that_has_not_met_it_says_so_rather_than_projecting():
    """There is no forecasting a wet night. Inventing one would be worse than
    saying it has not happened."""
    ev = wildlife.validate_event(BIG_NIGHT)
    d, hi, lo, rain = series([("2026-03-05", 40.0, 20.0, 0.0)])
    got = wildlife.condition_event(ev, d, hi, lo, rain, TODAY)
    assert got["reached_on"] is None
    assert got["projected_date"] is None
    assert "Not met yet" in got["note"]


def test_a_day_the_record_could_not_report_is_not_a_dry_day():
    """Calling a gap dry moves the date later; calling it wet moves it
    earlier. Skipping it is the only reading that adds nothing."""
    ev = wildlife.validate_event(BIG_NIGHT)
    d, hi, lo, rain = series([("2026-03-10", 52.0, 41.0, 0.0)])
    rain = [None]
    assert wildlife.condition_event(ev, d, hi, lo, rain, TODAY)["reached_on"] is None


def test_a_trigger_may_ask_about_the_day_as_well_as_the_night():
    ev = wildlife.validate_event({"species": "X", "event": "e", "driver": "condition",
                                  "trigger": {"min_day_f": 60}})
    d, hi, lo, rain = series([("2026-04-01", 55.0, 30.0, 0.0),
                              ("2026-04-08", 62.0, 35.0, 0.0)])
    assert wildlife.condition_event(ev, d, hi, lo, rain, TODAY)["reached_on"] == "2026-04-08"


def test_the_row_says_the_condition_in_the_growers_own_terms():
    ev = wildlife.validate_event(BIG_NIGHT)
    d, hi, lo, rain = series([("2026-03-14", 52.0, 41.0, 0.3)])
    said = wildlife.condition_event(ev, d, hi, lo, rain, TODAY)["threshold"]
    assert "40" in said and "rain" in said and "03-01" in said


def test_it_re_dates_itself_from_a_different_season():
    """The point of storing the definition rather than the date: next year's
    answer comes from next year's weather."""
    ev = wildlife.validate_event(BIG_NIGHT)
    for year, when in (("2026", "2026-03-14"), ("2027", "2027-03-22")):
        d, hi, lo, rain = series([(f"{year}-03-05", 48.0, 30.0, 0.5),
                                  (when, 52.0, 41.0, 0.3)])
        assert wildlife.condition_event(ev, d, hi, lo, rain, TODAY)["reached_on"] == when
