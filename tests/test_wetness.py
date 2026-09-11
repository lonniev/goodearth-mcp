"""Estimating leaf wetness, and the runs the models read.

Nothing here is measured, and the tests say so: these assert the ARITHMETIC of
the estimator, not that it matches a sensor. Whether an RH threshold matches a
plate in a Vermont field is a question for NEWA, and until somebody asks it the
numbers are a model of a model.
"""

from __future__ import annotations

from goodearth_mcp import wetness
from goodearth_mcp.wetness import Hour


def hour(i: int, rh=95.0, t=60.0, dew=None, rain=0.0, day="2026-09-03") -> Hour:
    return Hour(
        at=f"{day}T{i:02d}:00",
        temp_f=t,
        rh_pct=rh,
        dew_f=dew if dew is not None else (t - 1.0 if rh >= 90 else t - 12.0),
        precip_mm=rain,
    )


def block(hours: list[Hour]) -> dict:
    return {
        "time": [h.at for h in hours],
        "temperature_2m": [h.temp_f for h in hours],
        "relative_humidity_2m": [h.rh_pct for h in hours],
        "dew_point_2m": [h.dew_f for h in hours],
        "precipitation": [h.precip_mm for h in hours],
    }


# ── What makes an hour wet ───────────────────────────────────────────────


def test_humidity_at_the_threshold_is_wet_and_below_it_is_not():
    assert hour(0, rh=90.0).wet
    assert hour(0, rh=89.9).wet is False


def test_rain_wets_an_hour_the_humidity_would_not():
    # 70% humidity is a dry hour by the threshold, but it rained into air close
    # to its dew point, so the leaf was wet whatever the average says.
    assert hour(0, rh=70.0, t=60.0, dew=57.0, rain=1.4).wet


def test_rain_into_thirsty_air_is_not_counted_wet():
    # The same shower, 20 F from the dew point. It evaporates off the leaf, and
    # counting it would turn every summer squall into an infection period.
    assert hour(0, rh=40.0, t=80.0, dew=60.0, rain=1.4).wet is False


def test_a_trace_of_rain_is_not_a_wet_hour():
    assert hour(0, rh=70.0, t=60.0, dew=59.0, rain=0.1).wet is False


def test_humid_is_kept_separate_from_wet():
    # Hutton counts humidity alone. If rain folded into `humid`, this service's
    # late-blight verdict would quietly disagree with every published one.
    h = hour(0, rh=70.0, t=60.0, dew=58.0, rain=2.0)
    assert h.wet is True
    assert h.humid is False


def test_an_hour_the_feed_did_not_fill_is_not_a_dry_hour():
    gap = Hour(at="2026-09-03T04:00", temp_f=None, rh_pct=None, dew_f=None, precip_mm=None)
    assert gap.known is False
    assert gap.wet is False  # it cannot be counted wet either — it is unknown


# ── Runs ─────────────────────────────────────────────────────────────────


def test_a_dry_fortnight_has_no_runs():
    hours = [hour(i, rh=55.0) for i in range(24)]
    assert wetness.runs(hours) == []
    assert wetness.longest(wetness.runs(hours)) is None


def test_one_unbroken_stretch_is_one_run_with_its_mean_temperature():
    hours = [hour(i, rh=55.0) for i in range(3)] \
        + [hour(i, rh=95.0, t=58.0 + i) for i in range(3, 12)] \
        + [hour(i, rh=55.0) for i in range(12, 24)]
    rs = wetness.runs(hours)
    assert len(rs) == 1
    assert rs[0].hours == 9
    assert rs[0].start.endswith("T03:00")
    assert rs[0].end.endswith("T11:00")
    assert round(rs[0].mean_temp_f, 1) == 65.0  # 61..69


def test_one_dry_hour_breaks_a_run_when_nothing_bridges_it():
    hours = [hour(i, rh=95.0) for i in range(5)] \
        + [hour(5, rh=50.0)] \
        + [hour(i, rh=95.0) for i in range(6, 11)]
    rs = wetness.runs(hours)
    assert [r.hours for r in rs] == [5, 5]


def test_a_bridge_joins_them_and_says_it_did():
    hours = [hour(i, rh=95.0) for i in range(5)] \
        + [hour(5, rh=50.0)] \
        + [hour(i, rh=95.0) for i in range(6, 11)]
    rs = wetness.runs(hours, bridge=2)
    assert len(rs) == 1
    assert rs[0].hours == 10                      # the dry hour is NOT counted wet
    assert rs[0].as_dict()["bridged_dry_hours"] == 1


def test_a_gap_wider_than_the_bridge_still_breaks_it():
    hours = [hour(i, rh=95.0) for i in range(4)] \
        + [hour(i, rh=50.0) for i in range(4, 8)] \
        + [hour(i, rh=95.0) for i in range(8, 12)]
    assert [r.hours for r in wetness.runs(hours, bridge=2)] == [4, 4]


def test_trailing_dry_hours_are_not_dragged_onto_the_end_of_a_run():
    # The bridge holds hours open in case the run continues. If it does not,
    # they must be dropped rather than tacked on — a run that ends at 11:00
    # must not report an end of 13:00.
    hours = [hour(i, rh=95.0) for i in range(4)] + [hour(i, rh=50.0) for i in range(4, 8)]
    rs = wetness.runs(hours, bridge=2)
    assert len(rs) == 1
    assert rs[0].end.endswith("T03:00")
    assert rs[0].as_dict().get("bridged_dry_hours") is None


def test_the_wet_test_can_be_overridden_so_a_model_asks_its_own_question():
    hours = [hour(i, rh=70.0, t=60.0, dew=58.0, rain=2.0) for i in range(6)]
    assert wetness.runs(hours)[0].hours == 6                       # wet: rained
    assert wetness.runs(hours, wet=lambda h: h.humid) == []        # humid: no


# ── The estimator's definition moves the answer as much as the feed does ──


def test_counting_rain_changes_the_count_materially():
    # Sept 1 at Panton: three hours at or above 90% humidity, but six hours in
    # which it rained into close air. Which number is "the wet hours" is a
    # definition, not a measurement, and this is why the estimator is published.
    humid_only = [hour(i, rh=95.0) for i in range(3)]
    rain_too = [hour(i, rh=70.0, t=60.0, dew=58.0, rain=1.0) for i in range(3, 6)]
    hours = humid_only + rain_too + [hour(i, rh=50.0) for i in range(6, 24)]
    assert sum(1 for h in hours if h.humid) == 3
    assert sum(1 for h in hours if h.wet) == 6


# ── Reading the feed's block ─────────────────────────────────────────────


def test_a_short_column_truncates_rather_than_raising():
    # The feed occasionally returns one variable a few hours longer than the
    # rest. The shortest is the honest length.
    b = block([hour(i) for i in range(6)])
    b["precipitation"] = b["precipitation"][:4]
    assert len(wetness.read_hours(b)) == 4


def test_an_empty_block_reads_as_no_hours_not_as_an_error():
    assert wetness.read_hours({"time": []}) == []
    assert wetness.read_hours({}) == []


def test_a_null_in_a_column_survives_as_unknown():
    b = block([hour(i) for i in range(3)])
    b["relative_humidity_2m"][1] = None
    hours = wetness.read_hours(b)
    assert hours[1].rh_pct is None
    assert hours[1].known is True          # rain still came back
    assert hours[1].humid is False


# ── Days, coverage, and the accumulator ──────────────────────────────────


def test_days_group_on_the_feeds_own_local_day():
    hours = [hour(i, day="2026-09-03") for i in range(20, 24)] \
        + [hour(i, day="2026-09-04") for i in range(4)]
    days = wetness.by_day(hours)
    assert list(days) == ["2026-09-03", "2026-09-04"]
    assert len(days["2026-09-03"]) == 4


def test_coverage_distinguishes_nothing_wet_from_nothing_to_look_at():
    dry = [hour(i, rh=40.0) for i in range(24)]
    assert wetness.coverage(dry)["hours_read"] == 24
    assert wetness.coverage([])["hours"] == 0
    assert wetness.coverage([])["first"] is None


def test_the_accumulator_zeroes_on_a_reset_and_counts_wet_hours_between():
    hours = [hour(i, rh=95.0) for i in range(4)] \
        + [hour(4, rh=95.0, rain=9.0)] \
        + [hour(i, rh=95.0) for i in range(5, 8)]
    counts = dict(wetness.since_reset(hours, lambda h: (h.precip_mm or 0) > 5.0))
    assert counts["2026-09-03T03:00"] == 4
    assert counts["2026-09-03T04:00"] == 0      # the reset hour itself
    assert counts["2026-09-03T07:00"] == 3
