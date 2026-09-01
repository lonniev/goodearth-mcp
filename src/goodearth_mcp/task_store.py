"""The grower's tasks, in the operator's own Neon.

Follows ``feed_store`` exactly — vault from the runtime, one domain table,
plain SQL — because that is this repo's established shape and a second shape
would be a second thing to get wrong.

These used to live in localStorage. They moved here so the list can be sorted,
filtered and paged by the SERVER: a page of twenty out of two hundred is a
query, not something a browser should be doing after downloading all two
hundred.

Simple, single-day tasks by decision: one date, optional clock times on that
date, and a flag for whether it is a reminder or something that takes a slot.
No recurrence and no multi-day spans.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

TABLE = "goodearth_tasks"

_vault: Any = None
_schema_done = False

_DDL = (
    f"CREATE TABLE IF NOT EXISTS {TABLE} ("
    "id TEXT PRIMARY KEY, "
    "npub TEXT NOT NULL, "
    "region_id TEXT NOT NULL, "
    "title TEXT NOT NULL, "
    "note TEXT, "
    "due DATE, "
    "starts_at TIME, "
    "ends_at TIME, "
    "reminder_only BOOLEAN DEFAULT TRUE, "
    "done BOOLEAN DEFAULT FALSE, "
    "created_at TIMESTAMPTZ DEFAULT NOW(), "
    "updated_at TIMESTAMPTZ DEFAULT NOW())"
)

# CREATE TABLE IF NOT EXISTS does not add columns to a table that already
# exists. feed_store learned this when fetch_count read back NULL on a live
# feed, so every column added after the first deploy gets its own idempotent
# ALTER here rather than being silently absent.
_MIGRATIONS: list[str] = [
    f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS starts_at TIME",
    f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS ends_at TIME",
    f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS reminder_only BOOLEAN DEFAULT TRUE",
    f"CREATE INDEX IF NOT EXISTS {TABLE}_owner_idx ON {TABLE} (npub, region_id, due)",
]

# ── Sorting ──────────────────────────────────────────────────────────────
#
# A sort column NEVER reaches the SQL as text. It indexes this map and falls
# back to a safe default, which is the property that stops a sort parameter
# from becoming an injection — the same guard taxsort uses in
# tools/transactions.py. Adding a sortable column means adding it HERE; a
# column that is not in this map simply cannot be sorted by.
SORTABLE: dict[str, str] = {
    "due": "due",
    "title": "LOWER(title)",
    "done": "done",
    "created": "created_at",
    "updated": "updated_at",
    "starts": "starts_at",
}
DEFAULT_SORT = "due"

TIMEFRAMES = ("day", "week", "month", "season", "all")

# A caller-supplied pattern goes to Postgres' regex engine. That engine does
# not backtrack the way PCRE does, so this is not a ReDoS in the usual sense,
# but an elaborate pattern over a large table still holds a connection open.
MAX_SEARCH_LEN = 200
STATEMENT_TIMEOUT_MS = 3_000

MAX_PAGE_SIZE = 200


class TaskError(ValueError):
    """The task request cannot be honoured as asked."""


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
            logger.error("task schema DDL failed: %s", exc)
    return _vault


def _qualify(sql: str) -> str:
    prefix = getattr(_vault, "_schema_prefix", "") if _vault else ""
    return sql.replace(TABLE, f"{prefix}{TABLE}") if prefix else sql


def window_for(timeframe: str, today: date, season_start: date | None = None) -> tuple[date, date] | None:
    """The date range a timeframe means, or None for 'all'.

    'season' is the grower's season rather than a calendar quarter — a farm's
    year starts when its season starts, and reporting a calendar Q3 to someone
    asking what is due this season would be answering a different question.
    """
    tf = (timeframe or "all").lower()
    if tf not in TIMEFRAMES:
        raise TaskError(f"timeframe must be one of {', '.join(TIMEFRAMES)}")
    if tf == "all":
        return None
    if tf == "day":
        return (today, today)
    if tf == "week":
        start = today - timedelta(days=today.weekday())
        return (start, start + timedelta(days=6))
    if tf == "month":
        start = today.replace(day=1)
        nxt = (start + timedelta(days=32)).replace(day=1)
        return (start, nxt - timedelta(days=1))
    start = season_start or date(today.year, 1, 1)
    return (start, date(today.year, 12, 31))


def clean_search(pattern: str) -> str:
    """A regex the caller may search with, or a refusal."""
    p = (pattern or "").strip()
    if len(p) > MAX_SEARCH_LEN:
        raise TaskError(f"search pattern is longer than {MAX_SEARCH_LEN} characters")
    return p


def page_bounds(page: int, page_size: int) -> tuple[int, int]:
    size = max(1, min(int(page_size or 20), MAX_PAGE_SIZE))
    return max(0, int(page or 0)), size


async def save(
    npub: str, region_id: str, title: str, *,
    task_id: str = "", note: str = "", due: str | None = None,
    starts_at: str | None = None, ends_at: str | None = None,
    reminder_only: bool = True, done: bool = False,
) -> str:
    if not title.strip():
        raise TaskError("a task needs a title")
    tid = task_id or uuid.uuid4().hex
    v = await _vault_for()
    await v._execute(
        _qualify(
            f"INSERT INTO {TABLE} (id, npub, region_id, title, note, due, starts_at, ends_at, "
            "reminder_only, done) VALUES ($1,$2,$3,$4,$5,$6::date,$7::time,$8::time,$9,$10) "
            "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, note = EXCLUDED.note, "
            "due = EXCLUDED.due, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, "
            "reminder_only = EXCLUDED.reminder_only, done = EXCLUDED.done, updated_at = NOW()"
        ),
        [tid, npub, region_id, title.strip(), note or None, due or None,
         starts_at or None, ends_at or None, reminder_only, done],
    )
    return tid


async def listing(
    npub: str, region_id: str, *, timeframe: str = "all", search: str = "",
    sort_col: str = DEFAULT_SORT, sort_dir: str = "asc",
    page: int = 0, page_size: int = 20,
    today: date | None = None, season_start: date | None = None,
) -> dict[str, Any]:
    """One page of tasks, filtered and ordered by the database."""
    today = today or datetime.now(UTC).date()
    pat = clean_search(search)
    pg, size = page_bounds(page, page_size)
    window = window_for(timeframe, today, season_start)

    where = ["npub = $1", "region_id = $2"]
    args: list[Any] = [npub, region_id]
    if window:
        args.extend([window[0].isoformat(), window[1].isoformat()])
        where.append(f"due BETWEEN ${len(args) - 1}::date AND ${len(args)}::date")
    if pat:
        args.append(pat)
        # ~* is case-insensitive POSIX regex. Title and note together, so a
        # grower searching for a place finds the task that mentions it.
        where.append(f"(title ~* ${len(args)} OR COALESCE(note,'') ~* ${len(args)})")
    clause = " AND ".join(where)

    # Never interpolated: the caller's sort_col indexes SORTABLE.
    order = SORTABLE.get(sort_col, SORTABLE[DEFAULT_SORT])
    direction = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    v = await _vault_for()
    await v._execute(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}")
    total_r = await v._execute(
        _qualify(f"SELECT COUNT(*) AS n FROM {TABLE} WHERE {clause}"), args
    )
    total = int((total_r.get("rows") or [{"n": 0}])[0].get("n") or 0)

    rows_r = await v._execute(
        _qualify(
            f"SELECT id, title, note, due, starts_at, ends_at, reminder_only, done, "
            f"created_at, updated_at FROM {TABLE} WHERE {clause} "
            # A second key so equal values keep a stable order between pages.
            # Without it a row can appear on two pages, or on none.
            f"ORDER BY {order} {direction} NULLS LAST, id ASC "
            f"LIMIT {size} OFFSET {pg * size}"
        ),
        args,
    )
    return {
        "rows": rows_r.get("rows", []),
        "total": total,
        "page": pg,
        "page_size": size,
        "pages": max(1, (total + size - 1) // size),
        "sort_col": sort_col if sort_col in SORTABLE else DEFAULT_SORT,
        "sort_dir": direction.lower(),
        "timeframe": (timeframe or "all").lower(),
    }


async def delete(npub: str, task_id: str) -> bool:
    v = await _vault_for()
    r = await v._execute(
        _qualify(f"DELETE FROM {TABLE} WHERE id = $1 AND npub = $2"), [task_id, npub]
    )
    return bool(r.get("rowCount") or r.get("rowcount") or 0)


async def set_done(npub: str, task_id: str, done: bool) -> bool:
    v = await _vault_for()
    r = await v._execute(
        _qualify(
            f"UPDATE {TABLE} SET done = $3, updated_at = NOW() WHERE id = $1 AND npub = $2"
        ),
        [task_id, npub, done],
    )
    return bool(r.get("rowCount") or r.get("rowcount") or 0)
