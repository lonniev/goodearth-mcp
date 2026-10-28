"""A planting holds many stages: emergence, first bloom, fruit set, harvest.

Each stage is a heat sum from set-out, the same clock as the planting's
target, so the ledger, the chart and the calendar feed place every one.
"""

from __future__ import annotations

import asyncio
from datetime import date

import pytest

from goodearth_mcp import block_store, calendar_feed, crops
from tests.test_feed_survives_any_row import REGION, TODAY, _ground  # noqa: F401

PUMPKIN = {"crop": "Pumpkin", "set_out": "2026-05-20", "base_temp": 50, "stages": [
    {"stage": "harvest", "gdd": 1750, "emoji": "🎃", "key": True},
    {"stage": "first flowers", "gdd": 700, "emoji": "🌼"},
    {"stage": "emergence", "gdd": 120},
]}


def test_stages_read_sorted_by_heat_with_their_marks():
    p = crops.validate_planting(PUMPKIN)
    assert [s["stage"] for s in p["stages"]] == ["emergence", "first flowers", "harvest"]
    assert p["stages"][2] == {"stage": "harvest", "gdd": 1750.0, "emoji": "🎃", "key": True}


def test_the_last_stage_is_the_target_when_none_is_given():
    assert crops.validate_planting(PUMPKIN)["gdd_target"] == 1750.0


def test_a_given_target_stands():
    assert crops.validate_planting({**PUMPKIN, "gdd_target": 1600})["gdd_target"] == 1600.0


def test_a_planting_without_stages_has_none():
    p = crops.validate_planting({"crop": "Zinnia", "set_out": "2026-05-20", "gdd_target": 1100})
    assert p["stages"] == []


@pytest.mark.parametrize("stages", [
    "emergence 120",
    [{"stage": "", "gdd": 120}],
    [{"stage": "emergence"}],
    [{"stage": "emergence", "gdd": 0}],
    [{"stage": "emergence", "gdd": 99999}],
    [{"stage": "emergence", "gdd": "lots"}],
    [{"stage": f"s{i}", "gdd": i + 1} for i in range(crops.MAX_STAGES + 1)],
])
def test_a_stage_that_is_not_one_is_refused(stages):
    with pytest.raises(crops.CropError):
        crops.validate_planting({**PUMPKIN, "stages": stages})


def test_the_record_refuses_malformed_stages_on_write():
    with pytest.raises(block_store.BlockError):
        block_store.check_item_shape("planting", {"crop": "Pumpkin", "stages": [{"stage": "x"}]})
    block_store.check_item_shape("planting", PUMPKIN)


def test_each_stage_says_whether_it_is_reached_and_when_it_is_due():
    p = crops.validate_planting(PUMPKIN)
    dates = [f"2026-05-{d:02d}" for d in range(20, 32)] + [f"2026-06-{d:02d}" for d in range(1, 31)]
    cumulative = [i * 15.0 for i in range(len(dates))]   # 15 GDD a day
    st = crops.status(p, dates, cumulative, date(2026, 6, 30))
    by = {s["stage"]: s for s in st["stages"]}
    assert by["emergence"]["reached"] is True and by["emergence"]["projected_date"] is None
    assert by["first flowers"]["reached"] is False and by["first flowers"]["projected_date"]
    if by["harvest"]["projected_date"]:
        assert by["first flowers"]["projected_date"] < by["harvest"]["projected_date"]


def test_the_feed_dates_every_stage_once_and_the_target_not_twice():
    out = asyncio.run(calendar_feed.build_feed(
        REGION, "Frogdale Farm", "7355b20d", plantings=[PUMPKIN], today=TODAY))
    titles = [r["title"] for r in out["events"] if r["kind"] == "crop"]
    assert "Pumpkin — emergence" in titles and "Pumpkin — first flowers" in titles
    assert "Pumpkin — target" not in titles, "harvest already marks the target's heat"
