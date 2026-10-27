"""Plant profiles, kept once per plant for every grower.

A profile is a fact about a species — a pumpkin takes about a hundred days
wherever it is grown — and holds nothing about who asked. So it is stored once,
keyed by the plant, and the first grower to pick pumpkin pays for the lookup
that every later one reads. The operator's own Neon schema, as `feed_store`.

A year is long enough to keep one: a reference that changes faster than that
is not a reference.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_vault: Any = None
_schema_done = False

TABLE = "goodearth_plant_profiles"
KEEP_DAYS = 365

_DDL = (
    f"CREATE TABLE IF NOT EXISTS {TABLE} ("
    "key TEXT PRIMARY KEY, "
    "profile TEXT NOT NULL, "
    "model TEXT, "
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
            # Without the table every lookup is a fresh one: slower and dearer,
            # never wrong. It must not take the operator down.
            logger.error("plant profile schema DDL failed: %s", exc)
    return _vault


def _qualify(sql: str) -> str:
    prefix = getattr(_vault, "_schema_prefix", "") if _vault else ""
    return sql.replace(TABLE, f"{prefix}{TABLE}") if prefix else sql


async def get(key: str) -> dict[str, Any] | None:
    """The kept profile for this plant, unless it is older than a year."""
    v = await _vault_for()
    r = await v._execute(
        _qualify(f"SELECT profile FROM {TABLE} WHERE key = $1 "
                 f"AND updated_at > NOW() - INTERVAL '{KEEP_DAYS} days'"),
        [key],
    )
    rows = r.get("rows") or []
    if not rows:
        return None
    try:
        got = json.loads(rows[0].get("profile") or "")
    except (TypeError, ValueError):
        return None
    return got if isinstance(got, dict) else None


async def put(key: str, profile: dict[str, Any], model: str) -> None:
    v = await _vault_for()
    await v._execute(
        _qualify(
            f"INSERT INTO {TABLE} (key, profile, model) VALUES ($1, $2, $3) "
            "ON CONFLICT (key) DO UPDATE SET profile = EXCLUDED.profile, "
            "model = EXCLUDED.model, updated_at = NOW()"
        ),
        [key, json.dumps(profile, separators=(",", ":")), model],
    )


async def forget_everything(npub: str) -> dict[str, int]:
    """Nothing here is a patron's: a profile is a species fact with no npub, no
    ground and no record of who asked. Listed in `forget.STORES` all the same, so
    the guard that every table is swept stays a guard — and says why this one
    deletes nothing."""
    return {TABLE: 0}
