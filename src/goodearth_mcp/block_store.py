"""The grower's blocks and everything curated on them, in the operator's Neon.

A *block* is a plot of land the grower has saved: a name, some aliases, and a
geometry. Everything else the grower curates — plantings, pest models, the
wildlife roster, field observations — is an *item* on a block. Two tables, and
the second one holds all four kinds.

Follows ``feed_store`` and ``task_store`` — vault from the runtime, plain SQL —
with three deliberate departures, each of which is a bug in those modules:

* Table names are qualified through the vault's own ``_t()`` rather than a
  module-level ``str.replace``. The replace hits identifiers that merely START
  with the table name, which turns an index name into a syntax error.
* Each DDL statement is tried on its own. In the older modules one failure
  aborts the whole loop and leaves ``_schema_done`` False, so the DDL re-runs on
  every subsequent request forever.
* No ``SET LOCAL statement_timeout``. The Neon HTTP driver sends one statement
  per request, so there is no transaction for it to be local to; it reads like
  protection that is not there.

**Why one item table and not three.** The app edits one item at a time — add a
planting, retire a pest. A per-collection document would make each of those a
read-modify-write over a PAID tool: two tabs open, and one silently loses. Rows
make that impossible, and no call carries the grower's whole farm in either
direction.

**Why there is no version column.** History comes from validity. Retiring sets
``retired_at`` instead of deleting, so "what did this block grow in June?" is a
date predicate over rows that were live then. The vault has no transactions —
one POST per statement — so a version pointer could not be maintained atomically
anyway.

**What is encrypted and what is not.** The grower's content — names, geometry,
crops, species, thresholds, notes, coordinates — is encrypted at rest with the
SDK's ``VaultCipher``, bound to its owner by AAD so a ciphertext cannot be moved
between patrons. The skeleton that the database sorts, filters and pages by —
kind, season, observation date, retirement — stays in the clear, because
encrypting the columns you filter on means decrypting the whole table per query.
A block is found by name through a blind index: a deterministic HMAC of the
normalised name, which is an indexed equality lookup that does not put the plot's
name in the clear beside its own ciphertext.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import unicodedata
import uuid
from datetime import UTC, date, datetime
from typing import Any

logger = logging.getLogger(__name__)

BLOCKS = "goodearth_blocks"
ITEMS = "goodearth_block_items"

_vault: Any = None
_cipher: Any = None
_schema_done = False

#: The kinds of thing that can hang off a block. ``planting``/``pest``/
#: ``wildlife`` are scoped to a season; ``observation`` is scoped to the day it
#: was seen. The vocabulary is the server's — the grower's own word for a
#: sighting rides inside the payload as ``tag``, because the app has always
#: allowed any string there while ``calibration`` accepts only frost and stage.
KINDS = ("planting", "pest", "wildlife", "observation")
SEASON_KINDS = ("planting", "pest", "wildlife")

MAX_NAME_LEN = 120
MAX_ALIASES = 12
MAX_ITEMS_PER_CALL = 100
MAX_PAGE_SIZE = 200
MAX_SEARCH_LEN = 200

#: Ids minted by the browser before blocks existed server-side. Accepted so a
#: migrating grower keeps the ids their tasks already point at, and shape-checked
#: so the format cannot become a way to choose arbitrary primary keys.
LEGACY_ID = re.compile(r"^(pin|poly|map)-[0-9a-z]{1,16}$")

#: The worked example the app shows before a grower has drawn anything. It is
#: synthesised client-side and never persisted, so it has no row — but every
#: compute tool must still answer for it, or a brand-new grower opens an app
#: where nothing works. Resolved from here without touching the database.
EXAMPLE_BLOCK_ID = "example-champlain"
EXAMPLE_BLOCK: dict[str, Any] = {
    "block_id": EXAMPLE_BLOCK_ID,
    "name": "Champlain Valley",
    "aliases": [],
    "geometry": {
        "type": "Polygon",
        "coordinates": [[
            [-73.24, 44.44], [-73.16, 44.44], [-73.16, 44.52],
            [-73.24, 44.52], [-73.24, 44.44],
        ]],
    },
    "base_temp_f": 50.0,
    "seeded": True,
}


class BlockError(ValueError):
    """The block request cannot be honoured as asked.

    Raised, never returned as an error dict. ``paid_tool`` debits before it
    calls the body and rolls back only on an exception, so returning a failure
    dict charges the patron for a call that did nothing. A missing block is the
    ordinary first-run and new-device path; it must not cost a fare.
    """


class UnknownBlock(BlockError):
    """No block of this grower's answers to that identifier."""


class AmbiguousBlock(BlockError):
    """More than one block answers to that identifier."""

    def __init__(self, message: str, candidates: list[str]) -> None:
        super().__init__(message)
        self.candidates = candidates


_DDL: list[str] = [
    (
    f"CREATE TABLE IF NOT EXISTS {BLOCKS} ("
    "npub TEXT NOT NULL, "
    "block_id TEXT NOT NULL, "
    # Blind index: HMAC of the normalised name/alias. Lets a name be found by
    # an indexed equality test without storing the name in the clear.
    "lookup_key TEXT NOT NULL, "
    "name_enc TEXT NOT NULL, "
    "aliases_enc TEXT, "
    "geometry_enc TEXT NOT NULL, "
    "base_temp_f DOUBLE PRECISION DEFAULT 50, "
    "area_ha DOUBLE PRECISION, "
    "sample_count INTEGER, "
    "retired_at TIMESTAMPTZ, "
    "created_at TIMESTAMPTZ DEFAULT NOW(), "
    "updated_at TIMESTAMPTZ DEFAULT NOW(), "
    "PRIMARY KEY (npub, block_id))"
    ),
    (
    f"CREATE TABLE IF NOT EXISTS {ITEMS} ("
    "npub TEXT NOT NULL, "
    "item_id TEXT NOT NULL, "
    "block_id TEXT NOT NULL, "
    "kind TEXT NOT NULL, "
    "season_year INTEGER, "
    "observed_on DATE, "
    "payload_enc TEXT NOT NULL, "
    "source TEXT, "
    "retired_at TIMESTAMPTZ, "
    "created_at TIMESTAMPTZ DEFAULT NOW(), "
    "updated_at TIMESTAMPTZ DEFAULT NOW(), "
    "PRIMARY KEY (npub, item_id))"
    ),
]

# Index names are NOT built from the table constants: qualifying happens through
# the vault's _t(), and an index name may not be schema-qualified at all.
_MIGRATIONS: list[str] = [
    f"CREATE UNIQUE INDEX IF NOT EXISTS ge_blocks_lookup_idx ON {BLOCKS} (npub, lookup_key)",
    f"CREATE INDEX IF NOT EXISTS ge_items_season_idx ON {ITEMS} (npub, block_id, kind, season_year)",
    f"CREATE INDEX IF NOT EXISTS ge_items_seen_idx ON {ITEMS} (npub, block_id, kind, observed_on)",
    f"ALTER TABLE {ITEMS} ADD COLUMN IF NOT EXISTS source TEXT",
]


async def _vault_for() -> Any:
    """The vault, with the schema present.

    Every statement is tried on its own: an ALTER that fails on one deploy must
    not stop the index after it from being created, and must not leave the
    schema flag False so that the whole block re-runs on every later request.
    """
    global _vault, _cipher, _schema_done
    if _vault is None:
        from goodearth_mcp.server import runtime
        _vault = await runtime.vault()
        _cipher = getattr(_vault, "_cipher", None)
    if not _schema_done:
        ok = True
        for stmt in (*_DDL, *_MIGRATIONS):
            try:
                await _vault._execute(_t(stmt))
            except Exception as exc:  # noqa: BLE001
                ok = False
                logger.error("block schema statement failed: %s — %s", stmt[:60], exc)
        _schema_done = ok
    return _vault


def _t(sql: str) -> str:
    """Qualify both table names through the vault's own helper."""
    qualify = getattr(_vault, "_t", None)
    if not callable(qualify):
        return sql
    out = sql
    for table in (BLOCKS, ITEMS):
        out = re.sub(rf"\b{re.escape(table)}\b", qualify(table), out)
    return out


# ── Encryption ───────────────────────────────────────────────────────────
#
# The cipher is the SDK's, never a local one (CLAUDE.md §3). AAD binds a
# ciphertext to the patron and block it belongs to, so a row lifted out of the
# table and dropped into another patron's row will not decrypt.


def _aad(npub: str, block_id: str) -> str:
    return f"{npub}|{block_id}"


def _seal(value: Any, npub: str, block_id: str) -> str:
    plain = json.dumps(value, separators=(",", ":"), sort_keys=True)
    if _cipher is None:
        return plain
    return _cipher.encrypt(plain, aad=_aad(npub, block_id))


def _open(value: str | None, npub: str, block_id: str, *, default: Any = None) -> Any:
    if not value:
        return default
    plain = value
    if _cipher is not None:
        try:
            plain = _cipher.decrypt(value, aad=_aad(npub, block_id))
        except Exception:  # noqa: BLE001
            # A row written before encryption, or one that will not open. Fall
            # through to a JSON parse so a pre-encryption row still reads; a
            # genuinely unreadable value becomes the default rather than an
            # exception that would take out the whole listing.
            plain = value
    try:
        return json.loads(plain)
    except (TypeError, ValueError):
        logger.warning("block payload did not parse for %s/%s", npub[:12], block_id)
        return default


def norm(text: str) -> str:
    """The comparable form of a name: case, accents and spacing folded out."""
    folded = unicodedata.normalize("NFKD", (text or "").strip().lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", folded)


def lookup_key(npub: str, text: str) -> str:
    """A blind index entry for a name or alias.

    Deterministic so it can be looked up, and keyed by the operator's own vault
    key so the table does not double as a list of everybody's field names. Keyed
    per npub as well, so identical names from two growers do not collide into
    one another's uniqueness constraint.
    """
    secret = b""
    if _cipher is not None:
        secret = getattr(_cipher, "_key", b"") or b""
    msg = f"{npub}|{norm(text)}".encode()
    return hmac.new(secret or b"goodearth-blind-index-v1", msg, hashlib.sha256).hexdigest()


# ── Blocks ───────────────────────────────────────────────────────────────


def _clean_name(name: str) -> str:
    n = (name or "").strip()
    if not n:
        raise BlockError("a block needs a name")
    if len(n) > MAX_NAME_LEN:
        raise BlockError(f"a block name is at most {MAX_NAME_LEN} characters")
    return n


def _clean_aliases(aliases: Any) -> list[str]:
    if not aliases:
        return []
    if not isinstance(aliases, list):
        raise BlockError("aliases must be a list of names")
    out: list[str] = []
    for a in aliases:
        t = str(a or "").strip()
        if t:
            out.append(t[:MAX_NAME_LEN])
    if len(out) > MAX_ALIASES:
        raise BlockError(f"a block may carry at most {MAX_ALIASES} aliases")
    return out


def new_block_id(requested: str = "") -> str:
    """A block's id: the caller's only if it is a migrating browser id."""
    want = (requested or "").strip()
    if not want:
        return uuid.uuid4().hex
    if want == EXAMPLE_BLOCK_ID:
        raise BlockError("that id is reserved for the worked example")
    if not LEGACY_ID.match(want):
        raise BlockError("a block id is minted by the server")
    return want


async def save_block(
    npub: str, *, name: str, geometry: dict[str, Any],
    block_id: str = "", aliases: Any = None, base_temp_f: float = 50.0,
    area_ha: float | None = None, sample_count: int | None = None,
    retired: bool = False,
) -> dict[str, Any]:
    """Create or update one block. Returns the stored row, decrypted."""
    clean = _clean_name(name)
    alias_list = _clean_aliases(aliases)
    bid = block_id.strip() if block_id.strip() else ""
    if bid and bid != EXAMPLE_BLOCK_ID and not LEGACY_ID.match(bid):
        # An id we already minted, i.e. an update of an existing block.
        existing = await _row_by_id(npub, bid)
        if existing is None:
            raise UnknownBlock("no block of yours has that id")
    bid = bid or new_block_id()

    key = lookup_key(npub, clean)
    clash = await _row_by_lookup(npub, key)
    if clash is not None and clash["block_id"] != bid:
        raise AmbiguousBlock(
            f"another of your blocks already answers to {clean!r}",
            [clash["block_id"]],
        )

    v = await _vault_for()
    await v._execute(
        _t(
            f"INSERT INTO {BLOCKS} (npub, block_id, lookup_key, name_enc, aliases_enc, "
            "geometry_enc, base_temp_f, area_ha, sample_count, retired_at) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) "
            "ON CONFLICT (npub, block_id) DO UPDATE SET "
            "lookup_key = EXCLUDED.lookup_key, name_enc = EXCLUDED.name_enc, "
            "aliases_enc = EXCLUDED.aliases_enc, geometry_enc = EXCLUDED.geometry_enc, "
            "base_temp_f = EXCLUDED.base_temp_f, area_ha = EXCLUDED.area_ha, "
            "sample_count = EXCLUDED.sample_count, retired_at = EXCLUDED.retired_at, "
            f"updated_at = NOW() WHERE {BLOCKS}.npub = EXCLUDED.npub"
        ),
        [
            npub, bid, key,
            _seal(clean, npub, bid), _seal(alias_list, npub, bid),
            _seal(geometry, npub, bid),
            float(base_temp_f or 50.0), area_ha, sample_count,
            datetime.now(UTC).isoformat() if retired else None,
        ],
    )
    stored = await _row_by_id(npub, bid)
    if stored is None:  # pragma: no cover — the insert just succeeded
        raise BlockError("the block did not store")
    return stored


def _hydrate(row: dict[str, Any], npub: str) -> dict[str, Any]:
    bid = row.get("block_id") or ""
    return {
        "block_id": bid,
        "name": _open(row.get("name_enc"), npub, bid, default=""),
        "aliases": _open(row.get("aliases_enc"), npub, bid, default=[]) or [],
        "geometry": _open(row.get("geometry_enc"), npub, bid, default={}) or {},
        "base_temp_f": row.get("base_temp_f") or 50.0,
        "area_ha": row.get("area_ha"),
        "sample_count": row.get("sample_count"),
        "retired": bool(row.get("retired_at")),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


_BLOCK_COLS = (
    "npub, block_id, lookup_key, name_enc, aliases_enc, geometry_enc, "
    "base_temp_f, area_ha, sample_count, retired_at, created_at, updated_at"
)


async def _row_by_id(npub: str, block_id: str) -> dict[str, Any] | None:
    v = await _vault_for()
    r = await v._execute(
        _t(f"SELECT {_BLOCK_COLS} FROM {BLOCKS} WHERE npub = $1 AND block_id = $2"),
        [npub, block_id],
    )
    rows = r.get("rows") or []
    return _hydrate(rows[0], npub) if rows else None


async def _row_by_lookup(npub: str, key: str) -> dict[str, Any] | None:
    v = await _vault_for()
    r = await v._execute(
        _t(f"SELECT {_BLOCK_COLS} FROM {BLOCKS} WHERE npub = $1 AND lookup_key = $2"),
        [npub, key],
    )
    rows = r.get("rows") or []
    return _hydrate(rows[0], npub) if rows else None


async def list_blocks(npub: str, *, include_retired: bool = False) -> list[dict[str, Any]]:
    """Every block this grower has, newest first. No items ride along."""
    v = await _vault_for()
    clause = "npub = $1" if include_retired else "npub = $1 AND retired_at IS NULL"
    r = await v._execute(
        _t(f"SELECT {_BLOCK_COLS} FROM {BLOCKS} WHERE {clause} ORDER BY created_at DESC LIMIT 200"),
        [npub],
    )
    return [_hydrate(row, npub) for row in (r.get("rows") or [])]


async def resolve(npub: str, block: str) -> dict[str, Any]:
    """The block this identifier means, or a refusal that says which.

    Tiers, in order: the id, then the blind index over names and aliases. A tier
    that matches more than one row raises rather than guessing — picking one
    silently is how a grower ends up reading last year's field.
    """
    want = (block or "").strip()
    if not want:
        raise BlockError("name a block — its id, its name, or one of its aliases")

    if want == EXAMPLE_BLOCK_ID:
        return dict(EXAMPLE_BLOCK)

    by_id = await _row_by_id(npub, want)
    if by_id is not None:
        return by_id

    by_name = await _row_by_lookup(npub, lookup_key(npub, want))
    if by_name is not None:
        return by_name

    # Aliases are sealed rather than indexed, so this is the one tier that
    # scans. A grower has a handful of blocks; the list is already capped.
    hits = [
        b for b in await list_blocks(npub, include_retired=True)
        if any(norm(a) == norm(want) for a in b["aliases"])
    ]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        raise AmbiguousBlock(
            f"{len(hits)} of your blocks answer to {want!r} — name one by its id",
            [h["block_id"] for h in hits],
        )
    raise UnknownBlock(
        f"you have no block called {want!r} — save it first, then ask about it by name"
    )


# ── Items ────────────────────────────────────────────────────────────────


def _clean_kind(kind: str) -> str:
    k = (kind or "").strip().lower()
    if k not in KINDS:
        raise BlockError(f"kind must be one of {', '.join(KINDS)}")
    return k


def _clean_day(value: Any, field: str) -> str | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError as exc:
        raise BlockError(f"{field} must be an ISO date (YYYY-MM-DD)") from exc


async def save_items(
    npub: str, block_id: str, kind: str, items: list[dict[str, Any]],
    *, season_year: int | None = None,
) -> list[str]:
    """Write a batch of items of one kind. Returns the ids that landed.

    One statement for the whole batch. The vault has no transactions, so a
    multi-row INSERT is the only way a batch is all-or-nothing — and a field
    session that logged six sightings should cost one fare, not six.
    """
    k = _clean_kind(kind)
    if not items:
        return []
    if len(items) > MAX_ITEMS_PER_CALL:
        raise BlockError(f"at most {MAX_ITEMS_PER_CALL} items in one call")

    year = season_year if season_year is not None else datetime.now(UTC).year
    cols: list[str] = []
    args: list[Any] = []
    ids: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            raise BlockError("each item must be an object")
        payload = {q: w for q, w in item.items() if q not in ("item_id", "observed_on")}
        iid = str(item.get("item_id") or "").strip() or uuid.uuid4().hex
        seen = _clean_day(item.get("observed_on"), "observed_on")
        if k == "observation" and not seen:
            raise BlockError("an observation needs the day it was observed")
        n = len(args)
        cols.append(
            f"(${n + 1},${n + 2},${n + 3},${n + 4},${n + 5},${n + 6}::date,${n + 7},${n + 8})"
        )
        args.extend([
            npub, iid, block_id, k,
            None if k == "observation" else year,
            seen, _seal(payload, npub, block_id),
            str(item.get("source") or "") or None,
        ])
        ids.append(iid)

    v = await _vault_for()
    await v._execute(
        _t(
            f"INSERT INTO {ITEMS} (npub, item_id, block_id, kind, season_year, observed_on, "
            f"payload_enc, source) VALUES {','.join(cols)} "
            "ON CONFLICT (npub, item_id) DO UPDATE SET "
            "payload_enc = EXCLUDED.payload_enc, season_year = EXCLUDED.season_year, "
            "observed_on = EXCLUDED.observed_on, source = EXCLUDED.source, "
            "retired_at = NULL, updated_at = NOW() "
            f"WHERE {ITEMS}.npub = EXCLUDED.npub"
        ),
        args,
    )
    return ids


async def retire_items(npub: str, item_ids: list[str]) -> int:
    """Retire items. They stay readable as history; nothing is deleted."""
    ids = [str(i).strip() for i in (item_ids or []) if str(i).strip()]
    if not ids:
        return 0
    if len(ids) > MAX_ITEMS_PER_CALL:
        raise BlockError(f"at most {MAX_ITEMS_PER_CALL} items in one call")
    v = await _vault_for()
    holes = ",".join(f"${i + 2}" for i in range(len(ids)))
    r = await v._execute(
        _t(
            f"UPDATE {ITEMS} SET retired_at = NOW(), updated_at = NOW() "
            f"WHERE npub = $1 AND item_id IN ({holes}) AND retired_at IS NULL"
        ),
        [npub, *ids],
    )
    return int(r.get("rowCount") or r.get("rowcount") or 0)


async def list_items(
    npub: str, block_id: str, kind: str, *,
    season_year: int | None = None, since: str = "", until: str = "",
    as_of: str = "", include_retired: bool = False,
    page: int = 0, page_size: int = 50,
) -> dict[str, Any]:
    """One page of items of one kind.

    ``as_of`` asks what was live on a past day — the whole of the
    season-history requirement, answered by a date predicate rather than a
    version table.
    """
    k = _clean_kind(kind)
    pg = max(0, int(page or 0))
    size = max(1, min(int(page_size or 50), MAX_PAGE_SIZE))

    where = ["npub = $1", "block_id = $2", "kind = $3"]
    args: list[Any] = [npub, block_id, k]

    if as_of:
        moment = _clean_day(as_of, "as_of")
        args.append(moment)
        where.append(
            f"created_at <= ${len(args)}::date + 1 "
            f"AND (retired_at IS NULL OR retired_at > ${len(args)}::date + 1)"
        )
    elif not include_retired:
        where.append("retired_at IS NULL")

    if season_year is not None and k in SEASON_KINDS:
        args.append(int(season_year))
        where.append(f"season_year = ${len(args)}")
    if since:
        args.append(_clean_day(since, "since"))
        where.append(f"observed_on >= ${len(args)}::date")
    if until:
        args.append(_clean_day(until, "until"))
        where.append(f"observed_on <= ${len(args)}::date")

    clause = " AND ".join(where)
    v = await _vault_for()
    total_r = await v._execute(
        _t(f"SELECT COUNT(*) AS n FROM {ITEMS} WHERE {clause}"), args
    )
    total = int((total_r.get("rows") or [{"n": 0}])[0].get("n") or 0)

    # observed_on first for observations, season then creation for the rest;
    # item_id last so a row cannot land on two pages or on none.
    order = "observed_on DESC NULLS LAST, created_at DESC, item_id ASC"
    rows_r = await v._execute(
        _t(
            f"SELECT npub, item_id, block_id, kind, season_year, observed_on, payload_enc, "
            f"source, retired_at, created_at, updated_at FROM {ITEMS} WHERE {clause} "
            f"ORDER BY {order} LIMIT {size} OFFSET {pg * size}"
        ),
        args,
    )
    items = []
    for row in rows_r.get("rows") or []:
        payload = _open(row.get("payload_enc"), npub, block_id, default={}) or {}
        items.append({
            **payload,
            "item_id": row.get("item_id"),
            "kind": row.get("kind"),
            "season_year": row.get("season_year"),
            "observed_on": row.get("observed_on"),
            "source": row.get("source"),
            "retired": bool(row.get("retired_at")),
        })
    return {
        "items": items,
        "total": total,
        "page": pg,
        "page_size": size,
        "pages": (total + size - 1) // size if size else 0,
        "kind": k,
    }
