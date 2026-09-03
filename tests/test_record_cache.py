"""The weather cache: what it remembers, and what it must never break.

The point of this module is that a ten-year read leaves the critical path
permanently. The point of these tests is that it does so without ever becoming
the reason an answer fails.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from goodearth_mcp import record_cache as rc


@pytest.fixture(autouse=True)
def _clean_module():
    """Each test starts with no vault, no cipher and no patron."""
    rc._vault = None
    rc._cipher = None
    rc._schema_done = False
    token = rc._patron.set("")
    yield
    rc._patron.reset(token)
    rc._vault = None
    rc._cipher = None
    rc._schema_done = False


class FakeVault:
    """Enough of the Neon HTTP driver to exercise the read-through path.

    Statements are matched by their leading verb rather than parsed. That is
    the honest level of fidelity here: these tests are about the cache's
    decisions, and a real SQL engine would only hide them.
    """

    def __init__(self, *, fail: bool = False):
        self.rows: dict[tuple[str, str], str] = {}
        self.calls: list[tuple[str, list]] = []
        self.fail = fail

    def _t(self, table: str) -> str:
        return f"neon_schema.{table}"

    async def _execute(self, sql: str, params: list | None = None):
        params = params or []
        self.calls.append((sql, params))
        if self.fail:
            raise RuntimeError("the vault is unreachable")
        verb = sql.strip().split()[0].upper()
        if verb in ("CREATE", "ALTER"):
            return {}
        if verb == "SELECT":
            key = (params[0], params[1])
            held = self.rows.get(key)
            return {"rows": [{"payload_enc": held}] if held is not None else []}
        if verb == "INSERT":
            self.rows[(params[0], params[1])] = params[5]
            return {}
        return {}

    def statements(self, verb: str) -> list[tuple[str, list]]:
        return [c for c in self.calls if c[0].strip().upper().startswith(verb)]


# ── Freshness: the property the whole design rests on ────────────────────


def test_a_span_that_has_already_happened_never_expires():
    """The ten-year normals end last December. Nothing will revise them."""
    assert rc._fresh_until("2025-12-31", datetime(2026, 9, 3, tzinfo=UTC)) is None


def test_a_span_reaching_today_expires_soon():
    now = datetime(2026, 9, 3, 12, 0, tzinfo=UTC)
    until = rc._fresh_until("2026-09-03", now)
    assert until is not None
    assert date.fromisoformat(until[:10]) == now.date()


def test_a_span_reaching_into_the_future_expires_soon():
    now = datetime(2026, 9, 3, tzinfo=UTC)
    assert rc._fresh_until("2026-12-31", now) is not None


def test_freshness_is_a_string_because_the_driver_speaks_json():
    """A datetime raises at the Neon driver — see block_store's retired_at.

    This is not a style preference. The driver serialises parameters as JSON,
    so passing a datetime object fails at write time, which would show up as a
    cache that silently never stores anything.
    """
    until = rc._fresh_until("2026-12-31", datetime(2026, 9, 3, tzinfo=UTC))
    assert isinstance(until, str)
    import json
    json.dumps([until])  # must not raise


def test_an_unreadable_end_date_expires_rather_than_persisting():
    """The cautious direction: refetch beats serving something forever."""
    assert rc._fresh_until("not-a-date") is not None
    assert rc._fresh_until("") is not None


# ── Keys ─────────────────────────────────────────────────────────────────


def test_the_same_question_makes_the_same_key():
    a = rc._key("daily", "44.40000/-73.20000", "2026-04-01", "2026-09-03")
    b = rc._key("daily", "44.40000/-73.20000", "2026-04-01", "2026-09-03")
    assert a == b


@pytest.mark.parametrize(
    "kind,subject,start,end",
    [
        ("almanac", "44.40000/-73.20000", "2026-04-01", "2026-09-03"),
        ("daily", "44.50000/-73.20000", "2026-04-01", "2026-09-03"),
        ("daily", "44.40000/-73.20000", "2026-04-02", "2026-09-03"),
        ("daily", "44.40000/-73.20000", "2026-04-01", "2026-09-04"),
    ],
)
def test_a_different_question_makes_a_different_key(kind, subject, start, end):
    base = rc._key("daily", "44.40000/-73.20000", "2026-04-01", "2026-09-03")
    assert rc._key(kind, subject, start, end) != base


def test_tomorrow_rekeys_itself_so_there_is_no_invalidation_to_get_wrong():
    """A season-to-date span ends today, so at midnight it becomes a miss."""
    today = rc._key("daily", "pt", "2026-04-01", "2026-09-03")
    tomorrow = rc._key("daily", "pt", "2026-04-01", "2026-09-04")
    assert today != tomorrow


def test_widening_the_field_set_orphans_the_old_rows(monkeypatch):
    """Otherwise a new field arrives as a silent null column, not an error."""
    before = rc._key("almanac", "pt", "2020-01-01", "2025-12-31")
    monkeypatch.setattr(rc, "FIELDS_VERSION", rc.FIELDS_VERSION + 1)
    assert rc._key("almanac", "pt", "2020-01-01", "2025-12-31") != before


# ── Sealing ──────────────────────────────────────────────────────────────


def test_a_payload_survives_the_round_trip_without_a_cipher():
    value = {"daily": {"time": ["2026-01-01"], "temperature_2m_max": [31.5]}}
    sealed = rc._seal("npub1x", "k", value)
    assert rc._open("npub1x", "k", sealed) == value


def test_a_decade_of_dailies_compresses():
    """90 KB of mostly commas. Worth the gzip — the operator pays for the row."""
    days = [f"2016-01-{i:02d}" for i in range(1, 29)] * 130
    value = {"daily": {"time": days,
                       "temperature_2m_max": [40.1 + (i % 37) for i in range(len(days))],
                       "temperature_2m_min": [20.3 + (i % 29) for i in range(len(days))]}}
    import json
    raw = len(json.dumps(value))
    sealed = len(rc._seal("npub1x", "k", value))
    assert sealed < raw / 3, f"{sealed} vs {raw} raw"


def test_a_row_that_will_not_open_is_a_miss_not_an_exception():
    """A rotated vault key must cost a refetch, never an outage."""
    assert rc._open("npub1x", "k", "this is not a sealed payload") is None


# ── Read-through ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_with_no_patron_it_calls_straight_through(monkeypatch):
    """An unset context loses the cache, never the answer."""
    seen = []

    async def fake(lats, lons, start, end):
        seen.append((start, end))
        return [{"daily": {"time": [start]}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    got = await rc.daily_history([44.4], [-73.2], "2026-04-01", "2026-09-03")
    assert got == [{"daily": {"time": ["2026-04-01"]}}]
    assert len(seen) == 1


@pytest.mark.asyncio
async def test_a_miss_asks_upstream_once_and_remembers_it(monkeypatch):
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")
    calls = []

    async def fake(lats, lons, start, end):
        calls.append(1)
        return [{"daily": {"time": [start]}, "_feed": {"name": "Daymet v4"}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)

    first = await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")
    second = await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")

    assert len(calls) == 1, "the second read should not have reached upstream"
    assert first == second
    assert vault.statements("INSERT")


@pytest.mark.asyncio
async def test_provenance_survives_the_cache(monkeypatch):
    """A block naming the preferred feed while showing the fallback's numbers
    is worse than one that says nothing. The stamp is part of the payload."""
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")

    async def fake(lats, lons, start, end):
        return [{"daily": {"time": [start]},
                 "_feed": {"name": "Open-Meteo archive (ERA5)", "resolution_m": 9000}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")
    again = await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")
    assert again[0]["_feed"]["name"] == "Open-Meteo archive (ERA5)"
    assert again[0]["_feed"]["resolution_m"] == 9000


@pytest.mark.asyncio
async def test_an_immutable_span_is_stored_without_expiry(monkeypatch):
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")

    async def fake(lats, lons, start, end):
        return [{"daily": {"time": [start]}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")
    insert = vault.statements("INSERT")[0]
    assert insert[1][6] is None, "a span entirely in the past must not expire"


@pytest.mark.asyncio
async def test_a_span_reaching_today_is_stored_with_an_expiry(monkeypatch):
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")
    today = datetime.now(UTC).date().isoformat()

    async def fake(lats, lons, start, end):
        return [{"daily": {"time": [start]}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    await rc.daily_history([44.4], [-73.2], "2026-04-01", today)
    insert = vault.statements("INSERT")[0]
    assert isinstance(insert[1][6], str), "the running day gets revised upstream"


@pytest.mark.asyncio
async def test_a_broken_cache_still_returns_the_weather(monkeypatch):
    """The load-bearing test.

    The vault went absent on this service once already. A cache that turned its
    own outage into a weather outage would have made a bad day worse.
    """
    rc._vault, rc._cipher = FakeVault(fail=True), None
    rc._schema_done = True
    rc.serving("npub1grower")

    async def fake(lats, lons, start, end):
        return [{"daily": {"time": [start]}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    got = await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")
    assert got == [{"daily": {"time": ["2016-01-01"]}}]


@pytest.mark.asyncio
async def test_an_upstream_failure_is_still_raised(monkeypatch):
    """The cache must not swallow the one error the grower needs to see."""
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")

    async def fake(lats, lons, start, end):
        raise rc.sources.UpstreamError("the feed sent nothing back within 30s")

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    with pytest.raises(rc.sources.UpstreamError):
        await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")


@pytest.mark.asyncio
async def test_an_empty_answer_is_not_remembered(monkeypatch):
    """An empty read is usually a failure's shape, not a fact about the ground."""
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")

    async def fake(lats, lons, start, end):
        return []

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")
    assert not vault.statements("INSERT")


@pytest.mark.asyncio
async def test_normals_remember_which_feed_answered(monkeypatch):
    """The tuple, not just the records — the caller reports the source name."""
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")
    calls = []

    async def fake(lat, lon, start, end):
        calls.append(1)
        return [{"daily": {"time": ["2016-01-01"]}}], "Daymet v4 (NASA ORNL)", 1000

    monkeypatch.setattr(rc.sources, "fetch_normals_history", fake)
    await rc.normals_history(44.4, -73.2, "2016-01-01", "2025-12-31")
    records, name, res = await rc.normals_history(44.4, -73.2, "2016-01-01", "2025-12-31")

    assert len(calls) == 1
    assert name == "Daymet v4 (NASA ORNL)"
    assert res == 1000
    assert isinstance(res, int)
    assert records[0]["daily"]["time"] == ["2016-01-01"]


@pytest.mark.asyncio
async def test_one_grower_does_not_read_another_growers_row(monkeypatch):
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    calls = []

    async def fake(lats, lons, start, end):
        calls.append(1)
        return [{"daily": {"time": [start]}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)

    rc.serving("npub1alice")
    await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")
    rc.serving("npub1bob")
    await rc.daily_history([44.4], [-73.2], "2016-01-01", "2025-12-31")

    assert len(calls) == 2, "the row is scoped to its owner"


@pytest.mark.asyncio
async def test_expired_rows_are_pruned_so_a_daily_span_cannot_pile_up(monkeypatch):
    """A season-to-date key is never asked for again after midnight."""
    vault = FakeVault()
    rc._vault, rc._cipher = vault, None
    rc.serving("npub1grower")

    async def fake(lats, lons, start, end):
        return [{"daily": {"time": [start]}}]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    await rc.daily_history([44.4], [-73.2], "2026-04-01", "2026-09-03")
    deletes = vault.statements("DELETE")
    assert deletes, "nothing would ever remove yesterday's key"
    assert any("fresh_until" in sql for sql, _ in deletes)
