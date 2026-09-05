"""The tree answer, assembled against a block.

The synthetic year here is a cold-climate one on purpose: the case that must
never come back wrong is citrus in Vermont, and a fixture that is warm all
winter cannot catch an inverted comparison.
"""

from __future__ import annotations

import asyncio
import math
from datetime import date, timedelta

import pytest

from goodearth_mcp import block_store, perennial_window, record_cache
from goodearth_mcp import region as reg

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 3)


def _season(start: str, end: str, *, winter_low: float = -18.0) -> dict:
    """A plausible cold-climate daily record for whatever span is asked for.

    Synthesised rather than fetched, for the reason `test_row_identity` states:
    a test that reaches a third party is green where it is written and red
    where it is trusted.
    """
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=i) for i in range((b - a).days + 1)]
    highs, lows = [], []
    for d in days:
        peak = math.cos((d.timetuple().tm_yday - 196) / 365.0 * 2 * math.pi)
        mid = (winter_low + 82.0) / 2.0
        amp = (82.0 - winter_low) / 2.0
        highs.append(round(mid + amp * peak + 8.0, 1))
        lows.append(round(mid + amp * peak - 8.0, 1))
    return {
        "daily": {
            "time": [d.isoformat() for d in days],
            "temperature_2m_max": highs,
            "temperature_2m_min": lows,
        },
        "_feed": {"name": "synthetic (test)", "resolution_m": 1000},
    }


@pytest.fixture(autouse=True)
def _ground(monkeypatch):
    async def daily(lats, lons, start, end):
        return [_season(start, end) for _ in (lats or [0])]
    monkeypatch.setattr(record_cache, "daily_history", daily)
    yield


def run(trees, **kw):
    return asyncio.run(perennial_window.region_tree_window(REGION, trees, today=TODAY, **kw))


APPLE = {"tree": "Honeycrisp apple", "chill_hours": 800, "hardy_to_f": -30}
CITRUS = {"tree": "Meyer lemon", "chill_hours": 200, "hardy_to_f": 26}


# ── The answers, not the code ────────────────────────────────────────────


def test_citrus_does_not_survive_a_cold_climate_winter():
    """THE LOAD-BEARING CASE, and the reason the fixture is cold. If this ever
    comes back anything but too_cold the comparison is inverted, and every
    other verdict in the file is worthless."""
    [row] = run([CITRUS])["trees"]
    assert row["hardiness"]["verdict"] == "too_cold"
    assert row["hardiness"]["winters_below"] > 0


def test_an_apple_rated_to_thirty_below_survives_it():
    [row] = run([APPLE])["trees"]
    assert row["hardiness"]["verdict"] == "hardy"


def test_a_cold_winter_banks_chill_for_an_apple():
    [row] = run([APPLE])["trees"]
    assert row["chill"]["verdict"] in ("reliable", "usual")
    assert row["chill"]["median_hours"] > 800


def test_the_answer_names_the_window_and_model_it_counted_with():
    out = run([APPLE])
    assert "Nov" in out["chill"]["window"]
    assert out["chill"]["model"] == "hours at or below 45 °F"


def test_the_record_reaches_THIS_year_not_only_the_end_of_last():
    """The deep span stops on 31 December, so on its own the most recent winter
    it can complete is a year stale — its November and December are in, and the
    January and February that finish it are not. The season read closes it."""
    out = run([APPLE])
    assert out["chill"]["most_recent_winter"] == TODAY.year


def test_the_summary_leads_with_what_will_not_live_here():
    out = run([APPLE, CITRUS])
    assert "Meyer lemon" in out["summary"]
    assert out["trees"][0]["tree"] == "Meyer lemon"


# ── Partial knowledge, which is the ordinary case ────────────────────────


def test_a_tree_with_no_figures_is_reported_rather_than_refused():
    [row] = run([{"tree": "Black cherry"}])["trees"]
    assert row["hardiness"]["verdict"] == "unrated"
    assert row["chill"]["verdict"] == "unrated"
    assert row["hardiness"]["record_low_f"] < 0


def test_one_unusable_row_does_not_cost_the_rest():
    """The fault fixed four times elsewhere in this package."""
    out = run([APPLE, {"tree": "Bad", "chill_hours": 90_000}, CITRUS])
    assert len(out["trees"]) == 2
    assert out["skipped"][0]["name"] == "Bad"


def test_an_empty_list_is_refused_rather_than_answered_emptily():
    with pytest.raises(perennial_window.PerennialWindowError):
        run([])


def test_however_many_trees_a_grower_has_are_all_answered():
    """There is no cap on how many trees someone may own.

    This once refused at 41 and the Trees chiclet shipped broken against its
    own 89-entry library. The number was invented here, it constrained the
    grower's orchard rather than this service's payload, and nothing justified
    it — so the assertion is now that a big block is answered.
    """
    out = run([APPLE] * 250)
    assert len(out["trees"]) == 250


# ── Identity ─────────────────────────────────────────────────────────────


def test_the_saved_row_is_named_in_the_answer_and_changes_nothing():
    """Two rows can be the same tree — an orchard has more than one apple."""
    out = run([{**APPLE, "ref": "itm_north"}, {**APPLE, "ref": "itm_south"}])
    assert sorted(r["ref"] for r in out["trees"]) == ["itm_north", "itm_south"]

    plain = run([APPLE])["trees"][0]
    with_ref = {k: v for k, v in out["trees"][0].items() if k != "ref"}
    assert with_ref == plain


def test_a_feed_that_fails_for_THIS_year_still_answers_from_the_deep_record(monkeypatch):
    """The season read is a bonus, not a dependency. Losing it should cost the
    current winter, not the whole answer."""
    async def deep_only(lats, lons, start, end):
        if start.startswith(str(TODAY.year)):
            raise OSError("this year's feed is down")
        return [_season(start, end) for _ in (lats or [0])]

    monkeypatch.setattr(record_cache, "daily_history", deep_only)
    [row] = run([APPLE])["trees"]
    assert row["hardiness"]["verdict"] == "hardy"
