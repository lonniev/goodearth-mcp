"""Keeping a season of hours without keeping a new copy of it every day.

A cache key carries its span, so a key ending "today" is a different key
tomorrow. The hourly rows are ~50 KB each, and `MAX_ROWS_PER_PATRON` counts
ROWS — so one of them costs the same slot as a 2.5 KB daily row while a patron
opening the page daily minted a fresh one every morning.

Calendar months are boundaries the clock cannot move.
"""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import record_cache, sources

TODAY = date(2026, 9, 11)


def chunk(a: str, b: str, feed: str = "Open-Meteo archived model runs", res: int = 2000) -> dict:
    """One month of hours, one per day at noon — enough to be identifiable."""
    days = []
    cursor = date.fromisoformat(a)
    last = date.fromisoformat(b)
    while cursor <= last:
        days.append(f"{cursor.isoformat()}T12:00")
        cursor = date.fromordinal(cursor.toordinal() + 1)
    return {
        "hourly": {
            "time": days,
            "temperature_2m": [60.0] * len(days),
            "relative_humidity_2m": [95.0] * len(days),
            "dew_point_2m": [59.0] * len(days),
            "precipitation": [0.0] * len(days),
        },
        "_feed": {"name": feed, "resolution_m": res},
    }


# ── The split ────────────────────────────────────────────────────────────


def test_a_season_splits_into_whole_calendar_months():
    out = record_cache.month_chunks("2026-01-01", "2026-09-11", TODAY)
    assert len(out) == 9
    assert out[0] == ("2026-01-01", "2026-01-31", True)
    assert out[1] == ("2026-02-01", "2026-02-28", True)
    assert out[-1] == ("2026-09-01", "2026-09-11", False)


def test_only_the_month_holding_today_is_unfinished():
    out = record_cache.month_chunks("2026-01-01", "2026-09-11", TODAY)
    assert [f for _, _, f in out] == [True] * 8 + [False]


def test_a_finished_season_is_finished_all_the_way_through():
    out = record_cache.month_chunks("2024-01-01", "2024-12-31", TODAY)
    assert len(out) == 12
    assert all(f for _, _, f in out)
    assert out[1][1] == "2024-02-29", "2024 is a leap year"


def test_a_span_inside_one_month_is_one_chunk():
    assert record_cache.month_chunks("2026-09-03", "2026-09-11", TODAY) == [
        ("2026-09-03", "2026-09-11", False),
    ]


def test_a_span_starting_mid_month_keeps_its_partial_first_chunk():
    out = record_cache.month_chunks("2026-07-15", "2026-09-11", TODAY)
    assert out[0] == ("2026-07-15", "2026-07-31", True)


def test_the_boundaries_do_not_move_when_tomorrow_comes():
    """The whole mechanism. Yesterday's finished months must be today's."""
    a = record_cache.month_chunks("2026-01-01", "2026-09-11", TODAY)
    b = record_cache.month_chunks("2026-01-01", "2026-09-12", date(2026, 9, 12))
    assert [c[:2] for c in a][:8] == [c[:2] for c in b][:8]
    assert b[-1] == ("2026-09-01", "2026-09-12", False)


def test_every_day_in_the_span_lands_in_exactly_one_chunk():
    out = record_cache.month_chunks("2026-01-01", "2026-09-11", TODAY)
    covered = 0
    for a, b, _ in out:
        covered += date.fromisoformat(b).toordinal() - date.fromisoformat(a).toordinal() + 1
    whole = date(2026, 9, 11).toordinal() - date(2026, 1, 1).toordinal() + 1
    assert covered == whole
    from itertools import pairwise
    for (_, b, _), (a2, _, _) in pairwise(out):
        assert date.fromisoformat(a2).toordinal() == date.fromisoformat(b).toordinal() + 1


# ── Putting them back together ───────────────────────────────────────────


def test_stitching_restores_one_ordered_series():
    out = record_cache.stitch([chunk("2026-01-01", "2026-01-31"), chunk("2026-02-01", "2026-02-28")])
    times = out["hourly"]["time"]
    assert len(times) == 31 + 28
    assert times == sorted(times)
    assert len(out["hourly"]["temperature_2m"]) == len(times)


def test_an_hour_in_two_chunks_is_counted_once():
    # Months do not overlap, so this should never fire. It is here because a
    # double-counted wet night is an infection period that did not happen, and
    # this service has already made that mistake once at the forecast seam.
    out = record_cache.stitch([chunk("2026-01-01", "2026-01-31"), chunk("2026-01-15", "2026-02-05")])
    times = out["hourly"]["time"]
    assert len(times) == len(set(times))
    assert len(times) == 36  # Jan 1 - Feb 5


def test_chunks_arriving_out_of_order_still_come_back_in_order():
    out = record_cache.stitch([chunk("2026-03-01", "2026-03-31"), chunk("2026-01-01", "2026-01-31")])
    assert out["hourly"]["time"] == sorted(out["hourly"]["time"])
    assert out["hourly"]["time"][0].startswith("2026-01-01")


def test_provenance_names_the_COARSEST_feed_that_contributed():
    # An answer is only as good as its worst part. Naming the 2 km feed over a
    # season half-answered by the 9 km one would be provenance that lies.
    out = record_cache.stitch([
        chunk("2026-01-01", "2026-01-31"),
        chunk("2026-02-01", "2026-02-28", feed="Open-Meteo archive (ERA5)", res=9000),
    ])
    assert out["_feed"]["name"] == "Open-Meteo archive (ERA5)"


def test_stitching_nothing_gives_an_empty_record_rather_than_raising():
    assert record_cache.stitch([])["hourly"]["time"] == []


# ── What actually goes upstream ──────────────────────────────────────────


@pytest.fixture
def feed(monkeypatch):
    """Count the fetches, and remember what the cache was asked to keep."""
    calls: list[tuple[str, str]] = []
    store: dict[tuple[str, str], dict] = {}

    async def fetch(lat, lon, start, end):
        calls.append((start, end))
        return chunk(start, end)

    async def read(kind, subject, start, end):
        return store.get((start, end))

    async def write(kind, subject, start, end, value):
        store[(start, end)] = value

    monkeypatch.setattr(sources, "fetch_wetness_history", fetch)
    monkeypatch.setattr(record_cache, "_read", read)
    monkeypatch.setattr(record_cache, "_write", write)
    return calls, store


async def test_a_cold_cache_fetches_each_month_once(feed):
    calls, store = feed
    await record_cache.wetness_history(44.32, -73.30, "2026-01-01", TODAY.isoformat())
    assert len(calls) == 9
    assert len(store) == 9


async def test_asking_again_the_same_day_goes_nowhere_near_the_feed(feed):
    calls, _ = feed
    await record_cache.wetness_history(44.32, -73.30, "2026-01-01", TODAY.isoformat())
    calls.clear()
    await record_cache.wetness_history(44.32, -73.30, "2026-01-01", TODAY.isoformat())
    assert calls == []


async def test_the_next_day_refetches_only_the_tail(monkeypatch, feed):
    """The saving, stated as a test. Eight months are kept; one month moves."""
    calls, store = feed
    await record_cache.wetness_history(44.32, -73.30, "2026-01-01", "2026-09-11")
    assert len(calls) == 9
    calls.clear()

    # Tomorrow. Same season, one more day.
    import goodearth_mcp.record_cache as rc

    class _Tomorrow(rc.datetime):
        @classmethod
        def now(cls, tz=None):
            return rc.datetime(2026, 9, 12, 12, 0, tzinfo=tz)

    monkeypatch.setattr(rc, "datetime", _Tomorrow)
    store.pop(("2026-09-01", "2026-09-11"), None)   # the volatile chunk expired
    await record_cache.wetness_history(44.32, -73.30, "2026-01-01", "2026-09-12")
    assert calls == [("2026-09-01", "2026-09-12")], (
        "only the unfinished month should have gone upstream"
    )


async def test_the_answer_covers_the_whole_span_it_was_asked_for(feed):
    out = await record_cache.wetness_history(44.32, -73.30, "2026-01-01", "2026-09-11")
    times = out["hourly"]["time"]
    assert times[0].startswith("2026-01-01")
    assert times[-1].startswith("2026-09-11")
    assert len(times) == len(set(times))


async def test_a_half_cached_season_fetches_only_the_gaps(feed):
    calls, store = feed
    await record_cache.wetness_history(44.32, -73.30, "2026-01-01", "2026-09-11")
    calls.clear()
    for a, b in [("2026-04-01", "2026-04-30"), ("2026-07-01", "2026-07-31")]:
        store.pop((a, b))
    await record_cache.wetness_history(44.32, -73.30, "2026-01-01", "2026-09-11")
    assert sorted(calls) == [("2026-04-01", "2026-04-30"), ("2026-07-01", "2026-07-31")]
