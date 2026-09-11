"""The disease window — one fetch, every model, and what it does when a feed fails.

Upstream is stubbed at `record_cache` and `sources`, the way every other window
test in this suite stubs it. `conftest.py` blocks the socket, so a stub that
misses shows up as a NetworkReached rather than as a quietly real request.
"""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import block_store, disease, disease_window, record_cache, sources
from goodearth_mcp import region as reg

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 11)


def hourly(days: list[tuple[str, int, float]], feed: str = "Open-Meteo archived model runs") -> dict:
    """A record of whole days, each `(date, humid_hours, temp_f)`."""
    time, temp, rh, dew, rain = [], [], [], [], []
    for d, humid, t in days:
        for i in range(24):
            wet = i < humid
            time.append(f"{d}T{i:02d}:00")
            temp.append(t)
            rh.append(95.0 if wet else 55.0)
            dew.append(t - 1.0 if wet else t - 14.0)
            rain.append(0.0)
    return {
        "hourly": {
            "time": time, "temperature_2m": temp, "relative_humidity_2m": rh,
            "dew_point_2m": dew, "precipitation": rain,
        },
        "_feed": {"name": feed, "resolution_m": 2000},
    }


#: Frogdale's real week on the feed the service uses: two qualifying days that
#: are not consecutive.
FROGDALE = [
    ("2026-08-30", 2, 62.6),
    ("2026-08-31", 9, 56.9),
    ("2026-09-01", 3, 61.4),
    ("2026-09-02", 0, 66.3),
    ("2026-09-03", 7, 63.3),
]


@pytest.fixture
def ground(monkeypatch):
    """The default stub: Frogdale's week, and a dry forecast."""
    state: dict = {"history": hourly(FROGDALE), "forecast": hourly([("2026-09-12", 0, 64.0)])}

    async def history(lat, lon, start, end):
        if isinstance(state["history"], BaseException):
            raise state["history"]
        return state["history"]

    async def forecast(lat, lon, days=16):
        if isinstance(state["forecast"], BaseException):
            raise state["forecast"]
        return state["forecast"]

    monkeypatch.setattr(record_cache, "wetness_history", history)
    monkeypatch.setattr(sources, "fetch_wetness_forecast", forecast)
    return state


# ── The default question ─────────────────────────────────────────────────


async def test_naming_no_model_runs_all_of_them(ground):
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert out["success"] is True
    assert {d["model"] for d in out["diseases"]} == set(disease.MODELS)


async def test_naming_one_runs_only_that_one(ground):
    out = await disease_window.region_disease_window(
        REGION, [{"model": "hutton"}], today=TODAY,
    )
    assert [d["model"] for d in out["diseases"]] == ["hutton"]


async def test_the_frogdale_week_reports_late_blight_UNMET(ground):
    """The acceptance case. If this ever says "met", the feed pin has slipped."""
    out = await disease_window.region_disease_window(
        REGION, [{"model": "hutton"}], today=TODAY,
    )
    hutton = out["diseases"][0]
    assert hutton["at_risk"] is False
    assert hutton["qualifying_days"] == ["2026-08-31", "2026-09-03"]
    assert "CONSECUTIVE" in hutton["explain"]


async def test_zero_risk_is_stated_rather_than_left_as_an_empty_list(ground):
    ground["history"] = hourly([(f"2026-09-{d:02d}", 0, 70.0) for d in range(1, 9)])
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert out["success"] is True
    assert "No model reports risk" in out["summary"]
    assert "0 estimated wet hours" in out["summary"]


async def test_a_risky_season_counts_the_models_that_say_so(ground):
    ground["history"] = hourly([(f"2026-09-{d:02d}", 20, 66.0) for d in range(1, 9)])
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert "reporting risk" in out["summary"]
    assert any(d["at_risk"] for d in out["diseases"])


# ── Provenance ───────────────────────────────────────────────────────────


async def test_the_answer_names_the_feed_that_spoke(ground):
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    names = [s["name"] for s in out["sources"]]
    assert "Open-Meteo archived model runs" in names


async def test_a_fallback_feed_is_named_as_itself(ground):
    # The whole reason provenance exists here: ERA5 counts ~3x the wet hours,
    # and an answer that showed its numbers under the primary's name would be
    # worse than one with no provenance at all.
    ground["history"] = hourly(FROGDALE, feed="Open-Meteo archive (ERA5)")
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert "Open-Meteo archive (ERA5)" in [s["name"] for s in out["sources"]]


async def test_every_answer_says_the_wetness_was_estimated(ground):
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert out["wetness"]["estimator"]["measured"] is False
    assert "estimated" in out["note"].lower() or "ESTIMATED" in out["note"]
    assert any("never measured" in s["role"] for s in out["sources"])


# ── When a feed does not answer ──────────────────────────────────────────


async def test_a_failed_forecast_is_a_smaller_answer_not_a_failed_one(ground):
    ground["forecast"] = sources.UpstreamError("the forecast host timed out")
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert out["success"] is True
    assert "the forecast did not answer" in out["wetness"]["forecast_note"]
    assert out["wetness"]["hours"] == len(FROGDALE) * 24


async def test_a_failed_history_is_fatal_and_says_why(ground):
    # What already happened is the half a grower cannot get anywhere else.
    ground["history"] = sources.UpstreamError("the archive host timed out")
    with pytest.raises(disease_window.DiseaseWindowError) as exc:
        await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert "archive host timed out" in str(exc.value)


async def test_an_unreadable_record_says_so_rather_than_computing_on_nothing(ground):
    ground["history"] = {"_feed": {"name": "x", "resolution_m": 1}}
    with pytest.raises(disease_window.DiseaseWindowError) as exc:
        await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert "unreadable" in str(exc.value)


# ── Splicing the forecast onto the record ────────────────────────────────


async def test_an_hour_the_record_already_holds_is_not_counted_twice(ground):
    # The forecast endpoint repeats the last days of the record. Counting both
    # copies would turn one wet night into a two-day infection period.
    overlap = hourly([("2026-09-03", 7, 63.3), ("2026-09-12", 0, 64.0)])
    ground["forecast"] = overlap
    out = await disease_window.region_disease_window(
        REGION, [{"model": "hutton"}], today=TODAY,
    )
    assert out["wetness"]["hours"] == (len(FROGDALE) + 1) * 24
    assert out["diseases"][0]["qualifying_days"] == ["2026-08-31", "2026-09-03"]


async def test_the_answer_says_where_the_record_stops_and_the_forecast_starts(ground):
    out = await disease_window.region_disease_window(REGION, None, today=TODAY)
    assert out["wetness"]["forecast_from"] == "2026-09-12T00:00"


# ── Rows the caller got wrong ────────────────────────────────────────────


async def test_one_unusable_row_does_not_cost_the_others(ground):
    out = await disease_window.region_disease_window(
        REGION, [{"model": "guesswork"}, {"model": "botrytis"}], today=TODAY,
    )
    assert [d["model"] for d in out["diseases"]] == ["botrytis"]
    assert out["skipped"][0]["name"] == "guesswork"
    assert "botrytis" in out["skipped"][0]["reason"]


async def test_a_ref_rides_through_untouched_and_changes_no_answer(ground):
    plain = await disease_window.region_disease_window(
        REGION, [{"model": "botrytis"}], today=TODAY,
    )
    with_ref = await disease_window.region_disease_window(
        REGION, [{"model": "botrytis", "ref": "item-7"}], today=TODAY,
    )
    assert with_ref["diseases"][0]["ref"] == "item-7"
    assert "ref" not in plain["diseases"][0]
    assert {k: v for k, v in with_ref["diseases"][0].items() if k != "ref"} == plain["diseases"][0]


async def test_models_that_is_not_a_list_is_refused_plainly(ground):
    with pytest.raises(disease_window.DiseaseWindowError) as exc:
        await disease_window.region_disease_window(REGION, "botrytis", today=TODAY)
    assert "list" in str(exc.value)


async def test_a_long_list_is_answered_in_full(ground):
    # No arbitrary cap on what a patron may ask about.
    many = [{"model": "botrytis", "ref": f"r{i}"} for i in range(250)]
    out = await disease_window.region_disease_window(REGION, many, today=TODAY)
    assert len(out["diseases"]) == 250
    assert out["diseases"][-1]["ref"] == "r249"


# ── Past seasons ─────────────────────────────────────────────────────────


async def test_a_past_season_reads_the_whole_year_and_asks_for_no_forecast(monkeypatch):
    seen: dict = {}

    async def history(lat, lon, start, end):
        seen["start"], seen["end"] = start, end
        return hourly(FROGDALE)

    async def forecast(lat, lon, days=16):
        raise AssertionError("a finished season has no forecast to ask for")

    monkeypatch.setattr(record_cache, "wetness_history", history)
    monkeypatch.setattr(sources, "fetch_wetness_forecast", forecast)
    out = await disease_window.region_disease_window(REGION, None, today=TODAY, season=2024)
    assert seen["start"] == "2024-01-01" and seen["end"] == "2024-12-31"
    assert out["wetness"]["forecast_from"] is None


async def test_a_season_that_has_not_started_is_refused_rather_than_guessed(ground):
    with pytest.raises(disease_window.DiseaseWindowError) as exc:
        await disease_window.region_disease_window(REGION, None, today=TODAY, season=2030)
    assert "has not started" in str(exc.value)


# ── Into the calendar ────────────────────────────────────────────────────


async def test_a_referenced_wetness_row_resolves_to_dated_periods(ground):
    ground["history"] = hourly([(f"2026-09-{d:02d}", 20, 64.0) for d in range(1, 6)])
    events, unresolved = await disease_window.resolve_disease_models(
        REGION, [{"pest": "Botrytis", "model": "botrytis"}], today=TODAY,
    )
    assert unresolved == []
    assert events, "a qualifying period should have produced a dated event"
    assert events[0]["pest"] == "Botrytis"
    assert events[0]["via"] == "botrytis"


async def test_a_resolved_event_carries_the_keys_the_feed_reads(ground):
    """The shape IS the contract. The feed indexes e['pest'] and e['name'].

    Not a style assertion: `calendar_feed` reads those keys directly, and a
    KeyError there takes down the whole calendar — which is the one thing that
    module exists not to do. This caught exactly that.
    """
    ground["history"] = hourly([(f"2026-09-{d:02d}", 20, 64.0) for d in range(1, 6)])
    events, _ = await disease_window.resolve_disease_models(
        REGION, [{"pest": "Botrytis", "model": "botrytis"}], today=TODAY,
    )
    for key in ("pest", "name", "date", "source", "resolution_m"):
        assert key in events[0], f"the feed reads {key!r} and it is not there"
    from datetime import date as _date
    _date.fromisoformat(events[0]["date"])


async def test_a_season_with_no_qualifying_period_is_named_not_dropped(ground):
    events, unresolved = await disease_window.resolve_disease_models(
        REGION, [{"pest": "Botrytis", "model": "botrytis"}], today=TODAY,
    )
    assert events == []
    assert unresolved[0]["pest"] == "Botrytis"
    assert "no qualifying period" in unresolved[0]["reason"]


async def test_an_npn_row_is_left_alone_by_the_wetness_resolver(ground):
    # And the converse, which is the bug this pairing prevents: NPN reporting
    # "no dated layer for botrytis" about a question it was never asked.
    events, unresolved = await disease_window.resolve_disease_models(
        REGION, [{"pest": "Japanese beetle", "model": "usa-npn"}], today=TODAY,
    )
    assert (events, unresolved) == ([], [])


async def test_a_period_from_the_forecast_says_that_it_is_one(ground):
    ground["history"] = hourly([("2026-09-10", 0, 64.0)])
    ground["forecast"] = hourly([(f"2026-09-{d:02d}", 20, 64.0) for d in range(11, 15)])
    events, _ = await disease_window.resolve_disease_models(
        REGION, [{"pest": "Botrytis", "model": "botrytis"}], today=TODAY,
    )
    assert events and events[0]["forecast"] is True
    assert "from the forecast" in events[0]["detail"]
