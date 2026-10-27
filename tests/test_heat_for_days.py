"""A seed packet's days to maturity, as the heat target they hold on a plot.

Almost nobody publishes a degree-day target for a cultivar; days to maturity
are on nearly every packet. These pin the conversion: the plot's typical heat
for each calendar day, summed over that many days from the set-out.
"""

from __future__ import annotations

import asyncio
import math
from datetime import date, timedelta

import pytest

from goodearth_mcp import block_store, planting, planting_window, record_cache, server
from goodearth_mcp import region as reg
from goodearth_mcp.planting import PlantingError
from goodearth_mcp.planting_window import PlantingWindowError

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 3)


def _record(start: str, end: str) -> dict:
    """A smooth northern climate: cold Januaries that freeze, warm Julys."""
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=i) for i in range((b - a).days + 1)]
    hi, lo = [], []
    for d in days:
        peak = math.cos((d.timetuple().tm_yday - 196) / 365.0 * 2 * math.pi)
        hi.append(round(55 + 28 * peak, 1))
        lo.append(round(35 + 26 * peak, 1))
    return {"daily": {"time": [d.isoformat() for d in days],
                      "temperature_2m_max": hi, "temperature_2m_min": lo}}


@pytest.fixture(autouse=True)
def _ground(monkeypatch):
    async def daily(lats, lons, start, end):
        return [_record(start, end) for _ in (lats or [0])]
    monkeypatch.setattr(record_cache, "daily_history", daily)


def run(days: int, base: float = 50.0, out_on: date | None = None) -> dict:
    return asyncio.run(planting_window.region_heat_for_days(REGION, days, base, out_on, today=TODAY))


# ── The arithmetic ───────────────────────────────────────────────────────


def test_days_of_steady_heat_hold_that_many_times_the_heat():
    clim = {(date(2026, 1, 1) + timedelta(days=i)).strftime("%m-%d"): 10.0 for i in range(366)}
    assert planting.heat_over(date(2026, 6, 1), 75, clim) == 750.0


def test_it_is_finish_date_run_the_other_way():
    """The target it gives is reached on the packet's last day, not before."""
    clim = {(date(2026, 1, 1) + timedelta(days=i)).strftime("%m-%d"): 4.0 + (i % 7)
            for i in range(366)}
    out_on = date(2026, 5, 20)
    target = planting.heat_over(out_on, 80, clim)
    assert planting.finish_date(out_on, target, clim) == out_on + timedelta(days=79)


@pytest.mark.parametrize("days", [0, 13, 366, -5])
def test_days_out_of_any_packets_range_are_refused(days):
    with pytest.raises(PlantingError):
        planting.heat_over(date(2026, 5, 1), days, {"05-01": 10.0})


# ── On a plot ────────────────────────────────────────────────────────────


def test_without_a_set_out_it_counts_from_the_typical_last_frost():
    out = run(75)
    assert out["counted_from"] == "typical_last_frost"
    start = date.fromisoformat(out["from"])
    assert 3 <= start.month <= 6, "a northern last frost is a spring date"
    assert date.fromisoformat(out["to"]) == start + timedelta(days=74)


def test_a_set_out_is_counted_from_as_given():
    out = run(60, out_on=date(2027, 6, 1))
    assert (out["counted_from"], out["from"], out["to"]) == ("set_out", "2027-06-01", "2027-07-30")


def test_the_target_is_a_round_estimate_and_says_where_it_came_from():
    out = run(75)
    assert out["gdd_target"] % 10 == 0 and out["gdd_target"] > 0
    assert out["record"] and out["base_temp_f"] == 50.0 and out["note"]


def test_the_same_days_hold_more_heat_in_midsummer_than_in_spring():
    spring = run(60, out_on=date(2027, 4, 15))["gdd_target"]
    summer = run(60, out_on=date(2027, 6, 15))["gdd_target"]
    assert summer > spring


def test_a_higher_base_counts_less_heat_from_the_same_days():
    assert run(75, base=50)["gdd_target"] > run(75, base=60)["gdd_target"]


def test_an_unreadable_record_is_refused_not_answered_with_zero(monkeypatch):
    async def empty(lats, lons, start, end):
        return []
    monkeypatch.setattr(record_cache, "daily_history", empty)
    with pytest.raises(PlantingWindowError):
        run(75)


# ── The tool: every refusal raises, so the fare is refunded ──────────────


def _bare(fn):
    """The tool body under `paid_tool`, without the fare."""
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


@pytest.fixture
def _plot(monkeypatch):
    async def found(npub, block):
        return REGION, {"block_id": "b1", "base_temp_f": 45.0}
    monkeypatch.setattr(server, "_block_region", found)


def call(**kw):
    return asyncio.run(_bare(server.heat_for_days)(block="b1", npub="npub1x", **kw))


def test_the_tool_uses_the_plots_own_base_when_none_is_given(_plot):
    assert call(days_to_maturity=75)["base_temp_f"] == 45.0


@pytest.mark.parametrize("days", [0, 1000, -1, True, 75.5, "75", None])
def test_the_tool_refuses_a_count_that_is_not_a_packets(_plot, days):
    with pytest.raises(PlantingError):
        call(days_to_maturity=days)


@pytest.mark.parametrize("base", [10.0, 120.0, float("nan")])
def test_the_tool_refuses_a_base_no_crop_has(_plot, base):
    with pytest.raises(PlantingError):
        call(days_to_maturity=75, base_temp=base)


@pytest.mark.parametrize("bad", ["June 1", "2026-13-01", "'; DROP TABLE x; --"])
def test_the_tool_refuses_a_set_out_that_is_not_a_date(_plot, bad):
    with pytest.raises(PlantingError):
        call(days_to_maturity=75, set_out=bad)


def test_a_feed_that_does_not_answer_is_refused_so_the_fare_comes_back(_plot, monkeypatch):
    async def down(lats, lons, start, end):
        raise OSError("timed out")
    monkeypatch.setattr(record_cache, "daily_history", down)
    with pytest.raises(ValueError):
        call(days_to_maturity=75)


def test_every_refusal_is_a_value_error_so_paid_tool_refunds_and_says_why():
    assert issubclass(PlantingError, ValueError)
    assert issubclass(PlantingWindowError, ValueError)
