"""Where a computed calendar lives between refreshes.

The operator's own Neon schema, following taxsort-mcp's pattern: get the vault
from the runtime, ensure a domain table once, then plain SQL. Good Earth's data
is the operator's, and this is the operator's database.

Small on purpose. A feed is a token, a blob of iCalendar text, and enough
metadata to tell its owner what they are looking at.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_vault: Any = None
_schema_done = False

TABLE = "goodearth_calendar_feeds"

_DDL = (
    f"CREATE TABLE IF NOT EXISTS {TABLE} ("
    "token TEXT PRIMARY KEY, "
    "npub TEXT NOT NULL, "
    "region_name TEXT NOT NULL, "
    "ics TEXT NOT NULL, "
    "entry_count INTEGER DEFAULT 0, "
    "computed_on DATE, "
    "created_at TIMESTAMPTZ DEFAULT NOW(), "
    "updated_at TIMESTAMPTZ DEFAULT NOW())"
)


async def _vault_for() -> Any:
    global _vault, _schema_done
    if _vault is None:
        from goodearth_mcp.server import runtime
        _vault = await runtime.vault()
    if not _schema_done:
        try:
            await _vault._execute(_qualify(_DDL))
            _schema_done = True
        except Exception as exc:  # noqa: BLE001
            # A feed that cannot be stored is a feature that does not work, but
            # it must not take the rest of the operator down with it.
            logger.error("calendar feed schema DDL failed: %s", exc)
    return _vault


def _qualify(sql: str) -> str:
    """Prefix the table with the operator's own schema, as the wheel names it."""
    prefix = getattr(_vault, "_schema_prefix", "") if _vault else ""
    return sql.replace(TABLE, f"{prefix}{TABLE}") if prefix else sql


async def save(
    token: str, npub: str, region_name: str, ics: str,
    entry_count: int, computed_on: str,
) -> None:
    v = await _vault_for()
    await v._execute(
        _qualify(
            f"INSERT INTO {TABLE} (token, npub, region_name, ics, entry_count, computed_on) "
            "VALUES ($1, $2, $3, $4, $5, $6::date) "
            "ON CONFLICT (token) DO UPDATE SET "
            "region_name = EXCLUDED.region_name, ics = EXCLUDED.ics, "
            "entry_count = EXCLUDED.entry_count, computed_on = EXCLUDED.computed_on, "
            "updated_at = NOW()"
        ),
        [token, npub, region_name, ics, entry_count, computed_on],
    )


async def load(token: str) -> dict[str, Any] | None:
    """Fetch by token. The token IS the credential — see calendar_feed."""
    v = await _vault_for()
    r = await v._execute(
        _qualify(
            f"SELECT token, region_name, ics, entry_count, computed_on, updated_at "
            f"FROM {TABLE} WHERE token = $1"
        ),
        [token],
    )
    rows = r.get("rows", [])
    return rows[0] if rows else None


async def list_for(npub: str) -> list[dict[str, Any]]:
    v = await _vault_for()
    r = await v._execute(
        _qualify(
            f"SELECT token, region_name, entry_count, computed_on, updated_at "
            f"FROM {TABLE} WHERE npub = $1 ORDER BY updated_at DESC LIMIT 25"
        ),
        [npub],
    )
    return r.get("rows", [])


async def revoke(token: str, npub: str) -> bool:
    """Delete a feed. Scoped to its owner so a token alone cannot destroy one."""
    v = await _vault_for()
    r = await v._execute(
        _qualify(f"DELETE FROM {TABLE} WHERE token = $1 AND npub = $2 RETURNING token"),
        [token, npub],
    )
    return bool(r.get("rows"))
