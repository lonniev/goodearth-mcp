"""Reference answers, kept once for every grower — and let go of.

A plant's profile or a creature's life cycle is a fact about a species — a
pumpkin takes about a hundred days wherever it is grown — and holds nothing
about who asked. So each is stored once, keyed by what it answers
(`profile:taxon:76541`, `lifecycle:animal:taxon:5212:40`), and the first grower
to ask pays for the lookup that every later one reads. The operator's own Neon
schema, as `feed_store`.

It decays, so it neither grows without end nor goes stale:

* **Unused rows go.** An answer nobody has read for `IDLE_DAYS` is deleted.
* **Popular rows renew.** Content older than `FRESH_DAYS` is looked up again
  on its next read — and, over the last `JITTER_DAYS` before that, with a
  chance that rises day by day, so a plant every grower reads is not looked up
  by all of them in the same hour.
* **The table has a ceiling.** Past `MAX_ROWS`, the least recently read go.

Pruning rides on each write: no schedule, and nothing runs while nothing new is
learned.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_vault: Any = None
_schema_done = False

TABLE = "goodearth_reference_cache"

#: What a key may look like: a namespace, then lowercase words, digits, colons.
KEY = re.compile(r"^(profile|lifecycle):[a-z0-9 :._-]{1,160}$")

#: Days without a read before a row is let go.
IDLE_DAYS = 180
#: Days a row's content is trusted before it is looked up again.
FRESH_DAYS = 365
#: Days before `FRESH_DAYS` in which a renewal may come early, more likely each day.
JITTER_DAYS = 30
#: The most rows kept. A row is about 2 KB, so this is about 10 MB.
MAX_ROWS = 5000

_DDL = (
    f"CREATE TABLE IF NOT EXISTS {TABLE} ("
    "key TEXT PRIMARY KEY, "
    "profile TEXT NOT NULL, "
    "model TEXT, "
    "created_at TIMESTAMPTZ DEFAULT NOW(), "
    "updated_at TIMESTAMPTZ DEFAULT NOW(), "
    "last_read_at TIMESTAMPTZ DEFAULT NOW(), "
    "reads BIGINT DEFAULT 0)"
)

# CREATE TABLE IF NOT EXISTS adds no column to a table that already exists.
_MIGRATIONS = [
    f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ DEFAULT NOW()",
    f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS reads BIGINT DEFAULT 0",
    f"CREATE INDEX IF NOT EXISTS {TABLE}_last_read_idx ON {TABLE} (last_read_at)",
]


async def _vault_for() -> Any:
    global _vault, _schema_done
    if _vault is None:
        from goodearth_mcp.server import runtime
        _vault = await runtime.vault()
    if not _schema_done:
        try:
            await _vault._execute(_qualify(_DDL))
            for stmt in _MIGRATIONS:
                await _vault._execute(_qualify(stmt))
            _schema_done = True
        except Exception as exc:  # noqa: BLE001
            # Without the table every lookup is a fresh one: slower and dearer,
            # never wrong. It must not take the operator down.
            logger.error("reference cache schema DDL failed: %s", exc)
    return _vault


def _qualify(sql: str) -> str:
    """Point the table at the operator's schema, and nothing else.

    On word boundaries, as `task_store._qualify` explains: a plain replace also
    prefixes the index name, and a schema-qualified index name is a syntax
    error that would abort the migrations on every request.
    """
    prefix = getattr(_vault, "_schema_prefix", "") if _vault else ""
    if not prefix:
        return sql
    return re.sub(rf"\b{re.escape(TABLE)}\b", f"{prefix}{TABLE}", sql)


def due(age_days: float, roll: float) -> bool:
    """Whether a kept profile this old is looked up again now.

    Never before `FRESH_DAYS - JITTER_DAYS`; always from `FRESH_DAYS`; in
    between, with a chance rising evenly from none to certain. `roll` is a
    uniform draw in [0, 1), passed in so this stays pure.
    """
    start = FRESH_DAYS - JITTER_DAYS
    if age_days < start:
        return False
    if age_days >= FRESH_DAYS:
        return True
    return roll < (age_days - start) / JITTER_DAYS


async def get(key: str) -> tuple[dict[str, Any], float] | None:
    """The kept profile and its age in days, counting this as a read.

    The read is recorded in the same statement that fetches the row, so being
    used is what keeps a row: one round trip, and no read goes uncounted.
    """
    v = await _vault_for()
    r = await v._execute(
        _qualify(
            f"UPDATE {TABLE} SET last_read_at = NOW(), reads = reads + 1 WHERE key = $1 "
            "RETURNING profile, EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400.0 AS age_days"
        ),
        [key],
    )
    rows = r.get("rows") or []
    if not rows:
        return None
    try:
        got = json.loads(rows[0].get("profile") or "")
        age = float(rows[0].get("age_days") or 0.0)
    except (TypeError, ValueError):
        return None
    return (got, age) if isinstance(got, dict) else None


async def put(key: str, profile: dict[str, Any], model: str) -> None:
    """Keep a fresh profile, then let go of what has gone unused."""
    v = await _vault_for()
    await v._execute(
        _qualify(
            f"INSERT INTO {TABLE} (key, profile, model) VALUES ($1, $2, $3) "
            "ON CONFLICT (key) DO UPDATE SET profile = EXCLUDED.profile, "
            "model = EXCLUDED.model, updated_at = NOW(), last_read_at = NOW()"
        ),
        [key, json.dumps(profile, separators=(",", ":")), model],
    )
    await prune()


async def prune() -> int:
    """Delete rows idle past `IDLE_DAYS`, then any past `MAX_ROWS`. Rows gone."""
    v = await _vault_for()
    idle = await v._execute(
        _qualify(f"DELETE FROM {TABLE} WHERE last_read_at < NOW() - INTERVAL '{IDLE_DAYS} days'")
    )
    over = await v._execute(
        _qualify(
            f"DELETE FROM {TABLE} WHERE key IN (SELECT key FROM {TABLE} "
            f"ORDER BY last_read_at DESC, key OFFSET {MAX_ROWS})"
        )
    )
    return sum(int(x.get("rowCount") or x.get("rowcount") or 0) for x in (idle, over))


async def drop(key: str) -> bool:
    """Let one answer go, so the next ask looks it up afresh. True if it was kept."""
    v = await _vault_for()
    r = await v._execute(_qualify(f"DELETE FROM {TABLE} WHERE key = $1"), [key])
    return int(r.get("rowCount") or r.get("rowcount") or 0) > 0


#: Lookups under way, by key. A lookup takes a minute or more — the model reasons
#: before it answers — and a caller who gives up and asks again, or a second
#: grower picking the same hawk, would otherwise pay for a second identical one.
#: 2026-10-29: a timed-out call and its retry made two generations a minute apart.
_inflight: dict[str, asyncio.Task[tuple[dict[str, Any], bool]]] = {}


def _forget(key: str, task: asyncio.Task[Any]) -> None:
    """Drop a finished lookup, and read its failure so nobody logs it later."""
    _inflight.pop(key, None)
    if not task.cancelled():
        task.exception()


async def remember(
    key: str, fetch: Callable[[], Awaitable[tuple[dict[str, Any], str]]],
) -> tuple[dict[str, Any], bool]:
    """The kept answer for ``key``, or a fresh one from ``fetch``. True when kept.

    One lookup per key at a time: a caller asking for one already under way
    waits on it, and gets the same answer or the same failure. Shielded, so a
    caller who walks away does not cancel it — it finishes and is kept for the
    next ask.
    """
    task = _inflight.get(key)
    if task is None:
        task = asyncio.create_task(_remember_now(key, fetch))
        _inflight[key] = task
        task.add_done_callback(lambda t, k=key: _forget(k, t))
    return await asyncio.shield(task)


async def _remember_now(
    key: str, fetch: Callable[[], Awaitable[tuple[dict[str, Any], str]]],
) -> tuple[dict[str, Any], bool]:
    """One caller's lookup.

    A kept answer that has come due (`due`) is looked up again; if that fails,
    the kept one is still the better answer than none. ``fetch`` returns the
    answer and the model that gave it. A cache that cannot be read or written
    makes the lookup slower and dearer, never wrong.
    """
    try:
        kept = await get(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("reference cache unreadable: %s", exc)
        kept = None
    if kept and not due(kept[1], random.random()):
        return kept[0], True
    try:
        fresh, model = await fetch()
    except (ValueError, httpx.HTTPError, OSError):
        if kept:
            return kept[0], True
        raise
    try:
        await put(key, fresh, model)
    except Exception as exc:  # noqa: BLE001
        logger.warning("reference answer not kept: %s", exc)
    return fresh, False


async def forget_everything(npub: str) -> dict[str, int]:
    """Nothing here is a patron's: each answer is a species fact with no npub, no
    ground and no record of who asked. Listed in `forget.STORES` all the same, so
    the guard that every table is swept stays a guard — and says why this one
    deletes nothing."""
    return {TABLE: 0}
