"""A busy feed is not a broken one.

Two behaviours meet here, and they are halves of one promise: the service
should not turn upstream backpressure into an outage on a grower's page.

Upstream's side — a 429 is waited out rather than reported, and it is NOT
failed over to a sibling host that bills the same quota. Our side — when the
wait does not clear it, the reading already held is served, labelled with when
it was actually taken.

The failure this replaces was real: "could not read the season's observations:
https://archive-api.open-meteo.com/v1/archive returned HTTP 429" over ground
whose season had been read successfully two hours earlier.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from goodearth_mcp import record_cache as rc
from goodearth_mcp import sources

from .test_record_cache import FakeVault  # the same fake the cache's own tests use


@pytest.fixture(autouse=True)
def _no_waiting(monkeypatch):
    """Backoff is real in production and instant here.

    The delays are the thing under test only insofar as they HAPPEN; sleeping
    them would buy nothing but a slow suite. What each wait was for is asserted
    from the recorded calls.
    """
    waited: list[float] = []

    async def record(seconds: float) -> None:
        waited.append(seconds)

    monkeypatch.setattr(sources.asyncio, "sleep", record)
    sources._cooloff_until.clear()
    yield waited
    sources._cooloff_until.clear()


# ── Upstream: waiting it out ─────────────────────────────────────────────


@respx.mock
async def test_a_429_is_asked_again_and_answers(_no_waiting):
    """The minute quota recovers; the grower never learns it was ever tight."""
    route = respx.get(sources._ELEVATION).mock(
        side_effect=[
            httpx.Response(429),
            httpx.Response(200, json={"elevation": [76.0]}),
        ]
    )
    assert await sources.fetch_elevations([44.48], [-73.21]) == [76.0]
    assert route.call_count == 2
    assert _no_waiting, "a refused request must wait before asking again"


@respx.mock
async def test_a_429_gives_up_after_its_retries(_no_waiting):
    """A quota that is out for the day is not waited out forever."""
    route = respx.get(sources._ELEVATION).mock(return_value=httpx.Response(429))
    with pytest.raises(sources.RateLimited):
        await sources.fetch_elevations([44.48], [-73.21])
    assert route.call_count == sources._RETRIES + 1


@respx.mock
async def test_upstream_is_obeyed_when_it_says_how_long(_no_waiting):
    respx.get(sources._ELEVATION).mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "4"}),
            httpx.Response(200, json={"elevation": [76.0]}),
        ]
    )
    await sources.fetch_elevations([44.48], [-73.21])
    assert pytest.approx(_no_waiting[0], abs=0.5) == 4.0


@respx.mock
async def test_an_unreadable_retry_after_falls_back_to_our_own_wait(_no_waiting):
    """An HTTP-date is legal and unparsed here — a guess beats a misread date."""
    respx.get(sources._ELEVATION).mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"}),
            httpx.Response(200, json={"elevation": [76.0]}),
        ]
    )
    await sources.fetch_elevations([44.48], [-73.21])
    assert _no_waiting[0] > 0


@respx.mock
async def test_a_refusal_holds_back_the_rest_of_the_page(_no_waiting):
    """One 429 is news for every request sharing that quota.

    Without this, the first refusal becomes twenty retries arriving together —
    the burst that caused it, repeated.
    """
    respx.get(sources._ELEVATION).mock(return_value=httpx.Response(429))
    with pytest.raises(sources.RateLimited):
        await sources.fetch_elevations([44.48], [-73.21])

    respx.get(sources._FORECAST).mock(
        return_value=httpx.Response(200, json={"daily": {"time": [], "temperature_2m_max": [], "temperature_2m_min": []}})
    )
    before = len(_no_waiting)
    await sources.fetch_daily_forecast(44.48, -73.21, 7)
    assert len(_no_waiting) > before, "a later request to that provider must hold off"


@respx.mock
async def test_one_providers_refusal_does_not_stall_another(_no_waiting):
    """Daymet keeps its own budget. Open-Meteo's bad minute is not its problem."""
    respx.get(sources._ELEVATION).mock(return_value=httpx.Response(429))
    with pytest.raises(sources.RateLimited):
        await sources.fetch_elevations([44.48], [-73.21])

    respx.get(sources._DAYMET).mock(return_value=httpx.Response(200, text="not a record"))
    before = len(_no_waiting)
    with pytest.raises(sources.UpstreamError):
        await sources.fetch_daymet_history(44.48, -73.21, "2016-01-01", "2025-12-31")
    assert len(_no_waiting) == before


@respx.mock
async def test_a_429_does_not_fail_over_to_the_sibling_feed(_no_waiting):
    """Both hosts bill one quota, so the second only spends what is left.

    This is the exact shape of the reported bug: the grower was shown
    archive-api's refusal, which was never the feed the season asked for.
    """
    first = respx.get(sources._HISTORY).mock(return_value=httpx.Response(429))
    second = respx.get(sources._ARCHIVE_ERA5).mock(return_value=httpx.Response(200, json={}))
    with pytest.raises(sources.RateLimited):
        await sources.fetch_daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")
    assert first.call_count == sources._RETRIES + 1
    assert second.call_count == 0, "the fallback shares the exhausted budget"


@respx.mock
async def test_a_feed_that_is_actually_down_still_fails_over(_no_waiting):
    """The failover this service already had must survive the new rule."""
    respx.get(sources._HISTORY).mock(return_value=httpx.Response(502))
    respx.get(sources._ARCHIVE_ERA5).mock(
        return_value=httpx.Response(200, json={"daily": {"time": ["2026-01-01"], "temperature_2m_max": [40.0], "temperature_2m_min": [20.0]}})
    )
    out = await sources.fetch_daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")
    assert out and out[0]["_feed"]["name"] == "Open-Meteo archive (ERA5)"


# ── Ours: serving what we already have ───────────────────────────────────


@pytest.fixture
def _patron_with_a_vault():
    """A patron, a vault, and no cipher — the cache's own test conditions."""
    rc._vault = FakeVault()
    rc._cipher = None
    rc._schema_done = True
    token = rc._patron.set("npub1grower")
    yield rc._vault
    rc._patron.reset(token)
    rc._vault = None
    rc._schema_done = False


RECORD = {"daily": {"time": ["2026-09-18"], "temperature_2m_max": [70.0], "temperature_2m_min": [50.0]}}


async def _stale_row(vault, monkeypatch, when="2026-09-18 06:12:03+00"):
    """Write a row, then make every later read see it as expired."""
    monkeypatch.setattr(sources, "fetch_daily_history", _answers([RECORD]))
    await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")
    # The FakeVault ignores freshness, so expiry is simulated where the cache
    # asks for it: the fresh read finds nothing, the stale read finds the row.
    real = vault._execute

    async def expired(sql, params=None):
        out = await real(sql, params)
        if sql.strip().upper().startswith("SELECT") and "fresh_until > NOW()" in sql:
            return {"rows": []}
        if sql.strip().upper().startswith("SELECT") and out.get("rows"):
            return {"rows": [{**out["rows"][0], "created_at": when}]}
        return out

    vault._execute = expired


def _answers(value):
    async def fetch(*a, **kw):
        return value
    return fetch


def _refuses(exc):
    async def fetch(*a, **kw):
        raise exc
    return fetch


async def test_a_refused_season_is_served_from_the_last_reading(_patron_with_a_vault, monkeypatch):
    """The whole point. An expired row beats an error message."""
    vault = _patron_with_a_vault
    await _stale_row(vault, monkeypatch)

    monkeypatch.setattr(
        sources, "fetch_daily_history",
        _refuses(sources.RateLimited("open-meteo is rate-limiting this service", 2.0)),
    )
    out = await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")
    assert out[0]["daily"]["temperature_2m_max"] == [70.0]


async def test_what_is_served_says_when_it_was_read(_patron_with_a_vault, monkeypatch):
    """Silently serving it would make the page claim a freshness it lacks."""
    vault = _patron_with_a_vault
    await _stale_row(vault, monkeypatch)
    monkeypatch.setattr(sources, "fetch_daily_history", _refuses(sources.RateLimited("busy")))

    out = await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")
    assert out[0][sources.AS_OF].startswith("2026-09-18T06:12")
    assert sources.feed_of(out)["as_of"].startswith("2026-09-18T06:12")


async def test_a_fresh_answer_carries_no_reading_time(_patron_with_a_vault, monkeypatch):
    """`as_of` must mean something, so it appears only when it is true."""
    monkeypatch.setattr(sources, "fetch_daily_history", _answers([dict(RECORD)]))
    out = await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")
    assert sources.AS_OF not in out[0]
    assert "as_of" not in sources.feed_of(out)


async def test_nothing_held_means_the_failure_travels(_patron_with_a_vault, monkeypatch):
    """A grower with no prior reading must still be told the truth."""
    monkeypatch.setattr(sources, "fetch_daily_history", _refuses(sources.RateLimited("busy")))
    with pytest.raises(sources.RateLimited):
        await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")


async def test_an_unreadable_timestamp_serves_the_numbers_unlabelled(
    _patron_with_a_vault, monkeypatch,
):
    """A missing label, never an invented one."""
    vault = _patron_with_a_vault
    await _stale_row(vault, monkeypatch, when="the day before yesterday")
    monkeypatch.setattr(sources, "fetch_daily_history", _refuses(sources.RateLimited("busy")))

    out = await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18")
    assert out[0]["daily"]["temperature_2m_max"] == [70.0]
    assert sources.AS_OF not in out[0]


async def test_a_stitched_season_is_as_old_as_its_oldest_month():
    """One stale chunk makes the whole answer stale — never the newest part."""
    june = {"hourly": {"time": ["2026-06-01T00:00"], "temperature_2m": [60.0],
                       "relative_humidity_2m": [80.0], "dew_point_2m": [54.0],
                       "precipitation": [0.0]},
            sources.AS_OF: "2026-09-18T06:12:00+00:00"}
    july = {"hourly": {"time": ["2026-07-01T00:00"], "temperature_2m": [70.0],
                       "relative_humidity_2m": [70.0], "dew_point_2m": [60.0],
                       "precipitation": [0.0]}}
    assert rc.stitch([july, june])[sources.AS_OF] == "2026-09-18T06:12:00+00:00"
