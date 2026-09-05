"""The ground's weather record, remembered between calls.

Reading ten seasons of daily observations takes upstream 25 s on a good day
against a 30 s timeout, and on 2026-09-03 it took longer than that from Horizon
while answering a laptop in half a second. A grower opening the season page got
a spinner and then an outage, for a number that had not changed since the day
it was recorded.

So the record is remembered. Three properties make that honest rather than
merely fast:

**A span that has already happened cannot change.** The ten-year normals run
from January of ``today.year - 10`` to December 31 of last year — every day of
it is in the past, and no upstream revision is going to move it. Those rows are
kept without expiry. This is the whole win: the 25 s query leaves the critical
path permanently, not for an hour.

**A span ending today re-keys itself tomorrow.** The key contains the exact
start and end dates asked for, so "season start through today" becomes a
different key at midnight and misses on its own. There is no invalidation to
get wrong. Within the day the row still expires after ``INTRADAY_TTL`` so that
this morning's answer is not served against this afternoon's, since upstream
does revise the current day as its model runs land.

**A cache miss and a cache failure are the same thing.** Every statement here
is wrapped: a vault outage, a schema that did not migrate, a payload that will
not open — each one falls through to the live feed and logs. This is not
defensiveness for its own sake. The vault went absent on this service once
already, and a cache that turned its own outage into a weather outage would
have made a bad day worse.

Per patron, keyed by npub, encrypted like everything else the grower owns.
Weather over a farm is not secret, but a farm's COORDINATES are, and a shared
table keyed by grid cell would publish the set of cells someone is asking
about. Private property rarely overlaps, so the deduplication a shared table
would buy is mostly imaginary anyway.
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import json
import logging
import re
from contextvars import ContextVar
from datetime import UTC, date, datetime, timedelta
from typing import Any

from goodearth_mcp import sources

logger = logging.getLogger(__name__)

CACHE = "goodearth_weather_cache"

#: How long an answer that includes today may be served. Upstream revises the
#: running day as its model runs land, so this is short — but it is not zero,
#: because a grower clicking between four views wants four instant answers, not
#: four identical fetches.
INTRADAY_TTL = timedelta(hours=3)

#: Bumped when a field list below changes. It is part of every key, so widening
#: ``_DAILY_ALMANAC_HISTORY`` cannot serve a row that predates the new field —
#: which would arrive as a silent null column rather than as an error.
FIELDS_VERSION = 1

#: Rows kept per patron; beyond this the least recently used are dropped. The
#: operator pays for this storage, so the cache needs a ceiling — an unbounded
#: cache of a free upstream feed is a bill with no upper bound.
#:
#: Sized from measured rows, not guessed: ten seasons of daily max/min store at
#: 42 KB and six seasons of the almanac's fourteen fields at 84 KB (121 KB and
#: 277 KB raw — gzip returns about 3x). So this cap is a worst case of ~16 MB
#: per patron, against realistic use of nearer fifty rows and 3 MB: a farm's
#: distinct immutable keys are its cells times the kinds of question times the
#: span variants, and the spans only shift once a year. Raise it if a grower
#: with many blocks starts refetching what they already paid for.
MAX_ROWS_PER_PATRON = 200

#: The patron this request is being served for, set once at the tool boundary.
#:
#: A ContextVar rather than an argument threaded through ten impl signatures.
#: The impls take a ``Region`` and know nothing about billing or identity, which
#: is right — an impl computing a frost date has no business holding an npub.
#: Unset, every function here is a no-op that calls straight through, so a path
#: that forgets to set it loses the cache rather than the answer.
_patron: ContextVar[str] = ContextVar("goodearth_patron", default="")

_vault: Any = None
_cipher: Any = None
_schema_done = False

_DDL: list[str] = [
    (
    f"CREATE TABLE IF NOT EXISTS {CACHE} ("
    "npub TEXT NOT NULL, "
    "cache_key TEXT NOT NULL, "
    # What was asked for, in the clear, because it is bookkeeping rather than
    # the grower's content: a feed name and a span carry no coordinates.
    "kind TEXT NOT NULL, "
    "span_start DATE, "
    "span_end DATE, "
    "payload_enc TEXT NOT NULL, "
    # NULL means immutable — a span that has entirely happened.
    "fresh_until TIMESTAMPTZ, "
    "created_at TIMESTAMPTZ DEFAULT NOW(), "
    "used_at TIMESTAMPTZ DEFAULT NOW(), "
    "PRIMARY KEY (npub, cache_key))"
    ),
]

_MIGRATIONS: list[str] = [
    f"CREATE INDEX IF NOT EXISTS ge_wx_fresh_idx ON {CACHE} (npub, fresh_until)",
    f"CREATE INDEX IF NOT EXISTS ge_wx_used_idx ON {CACHE} (npub, used_at)",
]


def serving(npub: str) -> None:
    """Name the patron this request is for. Called at the tool boundary."""
    _patron.set((npub or "").strip())


def _t(sql: str) -> str:
    """Qualify the table name through the vault's own helper."""
    qualify = getattr(_vault, "_t", None)
    if not callable(qualify):
        return sql
    return re.sub(rf"\b{re.escape(CACHE)}\b", qualify(CACHE), sql)


async def _vault_for() -> Any:
    """The vault, with the schema present, or None if it cannot be had.

    Returns None rather than raising: every caller treats that as a miss. Each
    statement is tried on its own so one failed migration does not stop the
    index after it, nor leave the flag False so the whole block re-runs forever
    (both are bugs this repo has fixed elsewhere — see ``block_store``).
    """
    global _vault, _cipher, _schema_done
    if _vault is None:
        try:
            from goodearth_mcp.server import runtime
            _vault = await runtime.vault()
            _cipher = getattr(_vault, "_cipher", None)
        except Exception as exc:  # noqa: BLE001
            logger.warning("weather cache: no vault (%s)", exc)
            return None
    if not _schema_done:
        ok = True
        for stmt in (*_DDL, *_MIGRATIONS):
            try:
                await _vault._execute(_t(stmt))
            except Exception as exc:  # noqa: BLE001
                ok = False
                logger.error("weather cache schema failed: %s — %s", stmt[:60], exc)
        _schema_done = ok
    return _vault


# ── Keys, sealing, freshness ─────────────────────────────────────────────


def _key(kind: str, subject: str, start: str, end: str) -> str:
    """A stable digest of exactly what was asked for.

    ``subject`` is the coordinate list as it goes on the wire, so the same
    block asking the same question hits, and a neighbouring cell does not.
    """
    raw = f"v{FIELDS_VERSION}|{kind}|{subject}|{start}|{end}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _seal(npub: str, cache_key: str, value: Any) -> str:
    """Compress, then encrypt. A decade of dailies is 90 KB of mostly commas."""
    blob = gzip.compress(json.dumps(value, separators=(",", ":")).encode(), 6)
    packed = base64.b64encode(blob).decode()
    if _cipher is None:
        return packed
    return _cipher.encrypt(packed, aad=f"{npub}|{cache_key}")


def _open(npub: str, cache_key: str, stored: str) -> Any:
    """Undo ``_seal``, or return None if the row will not open.

    A row that will not decrypt is a miss, not an error. The operator's vault
    key can be rotated, and when it is, every row written under the old one
    becomes unreadable — that must cost a refetch, not an outage.
    """
    packed = stored
    if _cipher is not None:
        try:
            packed = _cipher.decrypt(stored, aad=f"{npub}|{cache_key}")
        except Exception:  # noqa: BLE001
            return None
    try:
        return json.loads(gzip.decompress(base64.b64decode(packed)).decode())
    except Exception:  # noqa: BLE001
        logger.warning("weather cache: a row did not open for %s", npub[:12])
        return None


def _fresh_until(end: str, now: datetime | None = None) -> str | None:
    """When this answer stops being usable — None if it never does.

    A span whose last day is already over is immutable. Anything reaching
    today or beyond gets the short window, because upstream revises the
    running day.

    Returned as an ISO string, not a ``datetime``: the Neon HTTP driver sends
    parameters as JSON and a ``datetime`` is not JSON-serializable, so passing
    one raises at the driver — the same reason ``block_store`` calls
    ``.isoformat()`` on ``retired_at``. An unparseable end date is treated as
    reaching today, which is the cautious direction: it expires.
    """
    now = now or datetime.now(UTC)
    try:
        last = date.fromisoformat(str(end)[:10])
    except (TypeError, ValueError):
        return (now + INTRADAY_TTL).isoformat()
    if last < now.date():
        return None
    return (now + INTRADAY_TTL).isoformat()


# ── The cache proper ─────────────────────────────────────────────────────


async def _read(kind: str, subject: str, start: str, end: str) -> Any:
    """What we already know, or None. Never raises."""
    npub = _patron.get()
    if not npub:
        return None
    cache_key = _key(kind, subject, start, end)
    try:
        v = await _vault_for()
        if v is None:
            return None
        r = await v._execute(
            _t(
                f"SELECT payload_enc FROM {CACHE} WHERE npub = $1 AND cache_key = $2 "
                "AND (fresh_until IS NULL OR fresh_until > NOW())"
            ),
            [npub, cache_key],
        )
        rows = r.get("rows") or []
        if not rows:
            return None
        found = _open(npub, cache_key, rows[0]["payload_enc"])
        if found is None:
            return None
        # Last-used drives eviction, so record the hit. Its failure is
        # immaterial — we already have the answer.
        try:
            await v._execute(
                _t(f"UPDATE {CACHE} SET used_at = NOW() WHERE npub = $1 AND cache_key = $2"),
                [npub, cache_key],
            )
        except Exception as exc:  # noqa: BLE001
            # Eviction ordering gets slightly worse. The answer does not.
            logger.debug("weather cache: could not note the hit (%s)", exc)
        logger.info("weather cache hit: %s %s..%s", kind, start, end)
        return found
    except Exception as exc:  # noqa: BLE001
        logger.warning("weather cache read failed (%s) — asking upstream", exc)
        return None


async def _write(kind: str, subject: str, start: str, end: str, value: Any) -> None:
    """Remember an answer. Never raises, and never blocks the answer."""
    npub = _patron.get()
    if not npub or not value:
        return
    cache_key = _key(kind, subject, start, end)
    try:
        v = await _vault_for()
        if v is None:
            return
        await v._execute(
            _t(
                f"INSERT INTO {CACHE} "
                "(npub, cache_key, kind, span_start, span_end, payload_enc, fresh_until) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7) "
                "ON CONFLICT (npub, cache_key) DO UPDATE SET "
                "payload_enc = EXCLUDED.payload_enc, "
                "fresh_until = EXCLUDED.fresh_until, "
                "used_at = NOW()"
            ),
            [
                npub, cache_key, kind, start[:10], end[:10],
                _seal(npub, cache_key, value),
                _fresh_until(end),
            ],
        )
        await _prune(v, npub)
    except Exception as exc:  # noqa: BLE001
        logger.warning("weather cache write failed (%s) — the answer still stands", exc)


async def _prune(v: Any, npub: str) -> None:
    """Drop what has expired, then what has not been wanted in longest.

    Expired rows would otherwise accumulate a row per day forever: a
    season-to-date span re-keys at midnight and the old key is never asked for
    again. Immutable rows have no ``fresh_until`` and survive this.
    """
    try:
        await v._execute(
            _t(f"DELETE FROM {CACHE} WHERE npub = $1 AND fresh_until IS NOT NULL AND fresh_until < NOW()"),
            [npub],
        )
        await v._execute(
            _t(
                f"DELETE FROM {CACHE} WHERE npub = $1 AND cache_key IN ("
                f"SELECT cache_key FROM {CACHE} WHERE npub = $1 "
                f"ORDER BY used_at DESC OFFSET {MAX_ROWS_PER_PATRON})"
            ),
            [npub],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("weather cache prune failed (%s)", exc)


# ── The read-through wrappers the impls call ─────────────────────────────
#
# Same signatures as their ``sources`` counterparts, so a call site changes by
# one module name. ``sources`` stays what its docstring claims: pure I/O with no
# persistence, no npubs and no billing.


async def daily_history(
    lats: list[float], lons: list[float], start: str, end: str,
) -> list[dict[str, Any]]:
    """Observed daily max/min, remembered. See ``sources.fetch_daily_history``."""
    subject = ",".join(f"{a:.5f}/{b:.5f}" for a, b in zip(lats, lons, strict=False))
    found = await _read("daily", subject, start, end)
    if found is not None:
        return found
    fresh = await sources.fetch_daily_history(lats, lons, start, end)
    await _write("daily", subject, start, end, fresh)
    return fresh


async def almanac_history(lat: float, lon: float, start: str, end: str) -> dict[str, Any]:
    """The almanac's field set from the record, remembered."""
    subject = f"{lat:.5f}/{lon:.5f}"
    found = await _read("almanac", subject, start, end)
    if found is not None:
        return found
    fresh = await sources.fetch_almanac_history(lat, lon, start, end)
    await _write("almanac", subject, start, end, fresh)
    return fresh


async def normals_history(
    lat: float, lon: float, start: str, end: str,
) -> tuple[list[dict[str, Any]], str, int]:
    """Multi-season history for one point, remembered.

    This is the expensive one — ten seasons, entirely in the past, and so
    cached without expiry. The source name and resolution are remembered with
    the records, because provenance that names the preferred feed while showing
    the fallback's numbers is worse than none.
    """
    subject = f"{lat:.5f}/{lon:.5f}"
    found = await _read("normals", subject, start, end)
    if isinstance(found, list) and len(found) == 3:
        records, name, res = found
        return records, str(name), int(res)
    records, name, res = await sources.fetch_normals_history(lat, lon, start, end)
    await _write("normals", subject, start, end, [records, name, res])
    return records, name, res


async def soil_history(
    lat: float, lon: float, archive_field: str, start: str, end: str,
) -> dict[str, Any]:
    """Daily mean soil temperature from the record, remembered."""
    subject = f"{lat:.5f}/{lon:.5f}|{archive_field}"
    found = await _read("soil", subject, start, end)
    if found is not None:
        return found
    fresh = await sources.fetch_soil_history(lat, lon, archive_field, start, end)
    await _write("soil", subject, start, end, fresh)
    return fresh


async def forget_everything(npub: str) -> dict[str, int]:
    """DELETE this patron's cached weather.

    Derived data, but derived FROM their coordinates — the cache key is a hash
    of the ground they asked about, and rows keyed to a patron who asked to be
    forgotten should not outlive them.
    """
    v = await _vault_for()
    r = await v._execute(_t(f"DELETE FROM {CACHE} WHERE npub = $1"), [npub])
    return {CACHE: int(r.get("rowCount") or r.get("rowcount") or 0)}
