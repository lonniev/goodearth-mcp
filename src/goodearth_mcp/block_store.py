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

**What is encrypted and what is not.** An item's content is in the clear, like
every other operator in the fleet: taxsort holds bank descriptions, amounts and
account names that way, excalibur holds post bodies that way, and Good Earth
holds crop names and species. This service was the fleet's only user of
``VaultCipher`` on business rows, and no requirement asked for it — ``ee6ec8b``
introduced the sealing stating only its mechanics. It was reached for by analogy
to a rule about **PII and financial data**, which a record of what grows in a
field is not.

That mattered because it was not free. ``VaultCipher`` derives one key from the
OPERATOR's nsec, so it defended a stolen database dump and nothing else — the
operator could read every row regardless — while making it impossible for
Postgres to sort, search, filter or index any of the grower's own content. The
Crops, Pests and Wildlife pages could not have the sorted, searchable, paged
tables that Tasks has, for a protection weaker than the one taxsort declines to
apply to tax records.

The block's **geometry stays sealed**. A polygon is the precise boundary of
someone's property and a dump would tie it to a public npub, which is a
question about physical safety rather than about business data. It is never
sorted or searched, so keeping it costs nothing.
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
_backfill_done = False

#: Rows converted per pass. Small enough that a cold start is not held up by a
#: long-established farm, large enough that a normal one finishes in one.
_BACKFILL_BATCH = 500

#: The kinds of thing that can hang off a block. ``planting``/``pest``/
#: ``wildlife`` are scoped to a season; ``observation`` is scoped to the day it
#: was seen. The vocabulary is the server's — the grower's own word for a
#: sighting rides inside the payload as ``tag``, because the app has always
#: allowed any string there while ``calibration`` accepts only frost and stage.
KINDS = ("planting", "pest", "wildlife", "observation")
SEASON_KINDS = ("planting", "pest", "wildlife")

MAX_NAME_LEN = 120
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

    # The grower's content, where the database can reach it. Each column is a
    # field the four pages sort, search or filter by; everything else rides in
    # `payload`. `payload_enc` is the legacy sealed column, read on the way out
    # and never written again — it is dropped once no row still needs it.
    f"ALTER TABLE {ITEMS} ADD COLUMN IF NOT EXISTS name TEXT",
    f"ALTER TABLE {ITEMS} ADD COLUMN IF NOT EXISTS event TEXT",
    f"ALTER TABLE {ITEMS} ADD COLUMN IF NOT EXISTS driver TEXT",
    f"ALTER TABLE {ITEMS} ADD COLUMN IF NOT EXISTS starts_on DATE",
    f"ALTER TABLE {ITEMS} ADD COLUMN IF NOT EXISTS target_gdd DOUBLE PRECISION",
    f"ALTER TABLE {ITEMS} ADD COLUMN IF NOT EXISTS payload JSONB",
    # payload_enc was NOT NULL when it was the only place content lived.
    f"ALTER TABLE {ITEMS} ALTER COLUMN payload_enc DROP NOT NULL",
    f"CREATE INDEX IF NOT EXISTS ge_items_name_idx ON {ITEMS} (npub, block_id, kind, name)",
    f"CREATE INDEX IF NOT EXISTS ge_items_starts_idx ON {ITEMS} (npub, block_id, kind, starts_on)",

]


# ── What the database can see, per kind ──────────────────────────────────
#
# Four kinds keep four vocabularies for the same few ideas, so the mapping is
# stated once here rather than branched on at every read and write. A key not
# listed simply stays in `payload`, which is the default and needs no entry.

#: payload key -> clear column, tried in order. First hit wins.
_CLEAR_COLUMNS: dict[str, tuple[str, ...]] = {
    # What the row is about: a crop, a pest, a creature, a sighting's tag.
    "name": ("crop", "pest", "species", "tag"),
    # Wildlife alone distinguishes several events for one creature — the
    # owner's case: migration arrival and migration departure are two rows
    # about one species, and only `event` tells them apart.
    "event": ("event",),
    "driver": ("driver",),
    # The day the clock starts: a set-out, a pest's biofix, a typical date.
    "starts_on": ("set_out", "biofix", "typical_on", "from"),
    # The heat it is counting toward. A pest carries one per stage rather than
    # one per model, so it has none here and sorts by name instead.
    "target_gdd": ("gdd_target", "gdd"),
}

#: Sort keys a caller may name. The value is SQL and the key is not, which is
#: what stops a sort parameter from becoming an injection — the guard
#: ``task_store.SORTABLE`` uses. A column absent from this map cannot be
#: sorted by at all.
SORTABLE: dict[str, str] = {
    "name": "LOWER(name)",
    "event": "LOWER(event)",
    "driver": "driver",
    "starts_on": "starts_on",
    "target_gdd": "target_gdd",
    "observed_on": "observed_on",
    "season": "season_year",
    "created": "created_at",
    "updated": "updated_at",
}

#: The order used when a caller names no sort. Unchanged from before the clear
#: columns existed, so adding the capability moved nothing already on screen.
LEGACY_ORDER = "observed_on DESC NULLS LAST, created_at DESC, item_id ASC"



def clear_columns(payload: dict[str, Any]) -> dict[str, Any]:
    """The parts of an item the database is allowed to see.

    Reads the item's own vocabulary through ``_CLEAR_COLUMNS`` and returns the
    five columns, any of which may be None. Nothing is removed from the
    payload: a crop is stored as ``crop`` there AND as ``name`` here, because
    a reader that had to know which of four keys held the name is exactly the
    branching this table exists to stop.
    """
    out: dict[str, Any] = {}
    for column, keys in _CLEAR_COLUMNS.items():
        value = next((payload[k] for k in keys if payload.get(k) not in (None, "")), None)
        if value is None:
            out[column] = None
        elif column == "target_gdd":
            try:
                out[column] = float(value)
            except (TypeError, ValueError):
                out[column] = None
        elif column == "starts_on":
            # A date column will not take "sometime in April". Anything that is
            # not a date is left out rather than rejected — the row is still a
            # true thing the grower recorded.
            try:
                out[column] = date.fromisoformat(str(value)[:10]).isoformat()
            except (TypeError, ValueError):
                out[column] = None
        else:
            out[column] = str(value)[:MAX_NAME_LEN]
    return out


def clean_search(pattern: str) -> str:
    """A regex the caller may search with, or a refusal."""
    pat = (pattern or "").strip()
    if not pat:
        return ""
    if len(pat) > MAX_SEARCH_LEN:
        raise BlockError(f"search pattern is longer than {MAX_SEARCH_LEN} characters")
    return pat


async def _backfill(v: Any) -> None:
    """Move sealed payloads into the clear columns, once.

    Bounded and idempotent: it only ever looks at rows that have not been
    converted, and it writes the new columns without touching ``payload_enc``,
    so the old read path keeps working throughout and a bad pass can simply be
    run again. If it fills a whole batch there is probably more, so the flag is
    left unset and the next request continues.
    """
    global _backfill_done
    rows_r = await v._execute(
        _t(
            f"SELECT npub, item_id, block_id, payload_enc FROM {ITEMS} "
            f"WHERE payload IS NULL AND payload_enc IS NOT NULL LIMIT {_BACKFILL_BATCH}"
        ),
    )
    rows = rows_r.get("rows") or []
    if not rows:
        _backfill_done = True
        return

    moved = 0
    for row in rows:
        npub, iid = row.get("npub") or "", row.get("item_id") or ""
        payload = _open(row.get("payload_enc"), npub, row.get("block_id") or "", default=None)
        if not isinstance(payload, dict):
            # Unreadable under the current key. Leave payload_enc alone and put
            # an empty object in payload so the row stops being retried forever
            # — it keeps its bookkeeping columns and stays visible as a row.
            payload = {}
        cols = clear_columns(payload)
        await v._execute(
            _t(
                f"UPDATE {ITEMS} SET payload = $3::jsonb, name = $4, event = $5, "
                "driver = $6, starts_on = $7::date, target_gdd = $8 "
                "WHERE npub = $1 AND item_id = $2"
            ),
            [npub, iid, json.dumps(payload), cols["name"], cols["event"],
             cols["driver"], cols["starts_on"], cols["target_gdd"]],
        )
        moved += 1
    logger.info("block items: moved %d row(s) into the clear columns", moved)
    if moved < _BACKFILL_BATCH:
        _backfill_done = True


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
    if _schema_done and not _backfill_done:
        try:
            await _backfill(_vault)
        except Exception as exc:  # noqa: BLE001
            # A failed conversion must never cost the grower their record: the
            # sealed column is still there and still read.
            logger.error("block item backfill failed: %s", exc)
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
        clear = clear_columns(payload)
        n = len(args)
        cols.append(
            f"(${n + 1},${n + 2},${n + 3},${n + 4},${n + 5},${n + 6}::date,${n + 7}::jsonb,"
            f"${n + 8},${n + 9},${n + 10},${n + 11},${n + 12}::date,${n + 13})"
        )
        args.extend([
            npub, iid, block_id, k,
            None if k == "observation" else year,
            seen, json.dumps(payload),
            str(item.get("source") or "") or None,
            clear["name"], clear["event"], clear["driver"],
            clear["starts_on"], clear["target_gdd"],
        ])
        ids.append(iid)

    v = await _vault_for()
    await v._execute(
        _t(
            f"INSERT INTO {ITEMS} (npub, item_id, block_id, kind, season_year, observed_on, "
            f"payload, source, name, event, driver, starts_on, target_gdd) "
            f"VALUES {','.join(cols)} "
            "ON CONFLICT (npub, item_id) DO UPDATE SET "
            "payload = EXCLUDED.payload, season_year = EXCLUDED.season_year, "
            "observed_on = EXCLUDED.observed_on, source = EXCLUDED.source, "
            "name = EXCLUDED.name, event = EXCLUDED.event, driver = EXCLUDED.driver, "
            "starts_on = EXCLUDED.starts_on, target_gdd = EXCLUDED.target_gdd, "
            # An edit supersedes whatever the sealed column held, so it is
            # cleared rather than left to contradict the row it sits in.
            "payload_enc = NULL, "
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


def _payload_of(row: dict[str, Any], npub: str, block_id: str) -> dict[str, Any]:
    """An item's content, from the clear column or the legacy sealed one.

    Both are read for as long as any row still holds only the sealed form. A
    row converted by the backfill has `payload`; one written before this change
    and not yet reached still has only `payload_enc`, and must not read as an
    empty item in the meantime.
    """
    clear = row.get("payload")
    if isinstance(clear, dict):
        return clear
    if isinstance(clear, str) and clear:
        try:
            return json.loads(clear)
        except (TypeError, ValueError):
            pass
    return _open(row.get("payload_enc"), npub, block_id, default={}) or {}


async def list_items(
    npub: str, block_id: str, kind: str, *,
    season_year: int | None = None, since: str = "", until: str = "",
    as_of: str = "", include_retired: bool = False,
    search: str = "", sort_col: str = "", sort_dir: str = "asc",
    page: int = 0, page_size: int = 50,
) -> dict[str, Any]:
    """One page of items of one kind, ordered and filtered by the database.

    ``as_of`` asks what was live on a past day — the whole of the
    season-history requirement, answered by a date predicate rather than a
    version table.

    ``sort_col`` and ``search`` reach the grower's own content, which they
    could not while it was sealed: a name that only exists inside a ciphertext
    cannot be an ORDER BY. Naming no ``sort_col`` keeps the order this function
    has always returned, so the new capability moved nothing already on screen.
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

    pat = clean_search(search)
    if pat:
        args.append(pat)
        # ~* is case-insensitive POSIX regex. Name and event together, so a
        # grower looking for "migration" finds both of a species' events.
        where.append(f"(COALESCE(name,'') ~* ${len(args)} OR COALESCE(event,'') ~* ${len(args)})")

    clause = " AND ".join(where)
    v = await _vault_for()
    total_r = await v._execute(
        _t(f"SELECT COUNT(*) AS n FROM {ITEMS} WHERE {clause}"), args
    )
    total = int((total_r.get("rows") or [{"n": 0}])[0].get("n") or 0)

    # Never interpolated: the caller's sort_col indexes SORTABLE. Naming none
    # keeps the legacy order — observed_on for sightings, creation for the
    # rest, item_id last so a row cannot land on two pages or on none.
    if sort_col and sort_col in SORTABLE:
        direction = "DESC" if str(sort_dir).lower() == "desc" else "ASC"
        order = f"{SORTABLE[sort_col]} {direction} NULLS LAST, item_id ASC"
    else:
        order = LEGACY_ORDER

    rows_r = await v._execute(
        _t(
            f"SELECT npub, item_id, block_id, kind, season_year, observed_on, payload, "
            f"payload_enc, source, retired_at, created_at, updated_at FROM {ITEMS} "
            f"WHERE {clause} ORDER BY {order} LIMIT {size} OFFSET {pg * size}"
        ),
        args,
    )
    items = []
    for row in rows_r.get("rows") or []:
        payload = _payload_of(row, npub, block_id)
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
        "sort_col": sort_col if sort_col in SORTABLE else "",
        "sort_dir": "desc" if str(sort_dir).lower() == "desc" else "asc",
    }


async def forget_everything(npub: str) -> dict[str, int]:
    """DELETE every block and item this patron has. Not a retirement.

    Every other removal here stamps `retired_at` and keeps the row, because
    "what did this block grow in June" is worth being able to answer. This is
    the one place that is wrong: a grower who asks to be forgotten and is soft
    deleted has been told something untrue.
    """
    v = await _vault_for()
    out: dict[str, int] = {}
    for table in (ITEMS, BLOCKS):   # items first: they point at the blocks
        r = await v._execute(_t(f"DELETE FROM {table} WHERE npub = $1"), [npub])
        out[table] = int(r.get("rowCount") or r.get("rowcount") or 0)
    return out
