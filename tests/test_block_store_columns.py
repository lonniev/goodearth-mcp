"""The clear columns: what the database may see, and what it may be told.

Good Earth was the fleet's only service sealing business rows, which meant
Postgres could not sort or search a crop name it could not read. These cover
the columns that changed that — the mapping out of four vocabularies, the guard
on the sort parameter, and the conversion of rows written before it.
"""

from __future__ import annotations

import json

import pytest

from goodearth_mcp import block_store as bs


@pytest.fixture(autouse=True)
def _clean():
    bs._vault = None
    bs._cipher = None
    bs._schema_done = False
    bs._backfill_done = False
    yield
    bs._vault = None
    bs._cipher = None
    bs._schema_done = False
    bs._backfill_done = False


class FakeVault:
    """Records statements. Rows are a dict, not a SQL engine — these tests are
    about which SQL is built and with which parameters."""

    def __init__(self, rows: list[dict] | None = None):
        self.calls: list[tuple[str, list]] = []
        self.rows = rows or []

    def _t(self, table: str) -> str:
        return f"sch.{table}"

    async def _execute(self, sql: str, params: list | None = None):
        self.calls.append((sql, params or []))
        if sql.strip().upper().startswith("SELECT"):
            rows, self.rows = self.rows, []
            return {"rows": rows}
        return {"rows": []}

    def sql_of(self, verb: str) -> list[str]:
        return [c[0] for c in self.calls if c[0].strip().upper().startswith(verb)]


# ── The mapping out of four vocabularies ─────────────────────────────────


def test_each_kind_names_its_subject_in_its_own_words():
    """crop, pest, species and tag are one idea. The column is `name`."""
    assert bs.clear_columns({"crop": "Zinnia"})["name"] == "Zinnia"
    assert bs.clear_columns({"pest": "Codling moth"})["name"] == "Codling moth"
    assert bs.clear_columns({"species": "Strix varia"})["name"] == "Strix varia"
    assert bs.clear_columns({"tag": "aphids on the east row"})["name"] == "aphids on the east row"


def test_a_species_event_is_kept_because_it_is_what_tells_two_rows_apart():
    """The owner's case: arrival and departure are two rows about one bird."""
    arrival = bs.clear_columns({"species": "Hirundo rustica", "event": "migration arrival"})
    departure = bs.clear_columns({"species": "Hirundo rustica", "event": "migration departure"})
    assert arrival["name"] == departure["name"]
    assert arrival["event"] != departure["event"]


def test_the_day_a_clock_starts_comes_from_whichever_key_holds_it():
    assert bs.clear_columns({"set_out": "2026-05-20"})["starts_on"] == "2026-05-20"
    assert bs.clear_columns({"biofix": "2026-04-01"})["starts_on"] == "2026-04-01"
    assert bs.clear_columns({"typical_on": "2026-03-15"})["starts_on"] == "2026-03-15"


def test_a_date_that_is_not_a_date_is_left_out_rather_than_refused():
    """"Sometime in April" is still a true thing the grower recorded."""
    got = bs.clear_columns({"crop": "Garlic", "set_out": "sometime in April"})
    assert got["starts_on"] is None
    assert got["name"] == "Garlic", "the row survives its unusable date"


def test_a_heat_target_becomes_a_number_or_nothing():
    assert bs.clear_columns({"gdd_target": "1100"})["target_gdd"] == 1100.0
    assert bs.clear_columns({"gdd": 450})["target_gdd"] == 450.0
    assert bs.clear_columns({"gdd_target": "lots"})["target_gdd"] is None


def test_a_pest_carries_no_single_target_and_says_so():
    """Its heat lives per stage, so the model has none. It sorts by name."""
    got = bs.clear_columns({"pest": "Codling moth", "stages": [{"stage": "1st flight", "gdd": 220}]})
    assert got["target_gdd"] is None
    assert got["name"] == "Codling moth"


def test_an_item_with_nothing_recognisable_yields_all_nulls():
    assert set(bs.clear_columns({"whatever": 1}).values()) == {None}


def test_extraction_never_removes_anything_from_the_payload():
    """A crop stays `crop` in the payload AND becomes `name` here. A reader
    that had to know which of four keys held the name is the branching this
    column exists to stop."""
    payload = {"crop": "Zinnia", "gdd_target": 1100}
    bs.clear_columns(payload)
    assert payload == {"crop": "Zinnia", "gdd_target": 1100}


# ── The sort parameter ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_hostile_sort_column_cannot_reach_the_sql():
    v = FakeVault(rows=[{"n": 0}])
    bs._vault, bs._schema_done, bs._backfill_done = v, True, True
    await bs.list_items(
        "npub1a", "blk", "planting",
        sort_col="name; DROP TABLE goodearth_block_items; --",
    )
    every = " ".join(v.sql_of("SELECT"))
    assert "DROP TABLE" not in every
    assert bs.LEGACY_ORDER in every, "an unknown key falls back, it does not interpolate"


@pytest.mark.asyncio
async def test_a_named_sort_column_is_used():
    v = FakeVault(rows=[{"n": 0}])
    bs._vault, bs._schema_done, bs._backfill_done = v, True, True
    await bs.list_items("npub1a", "blk", "planting", sort_col="name", sort_dir="desc")
    sql = " ".join(v.sql_of("SELECT"))
    assert "ORDER BY LOWER(name) DESC NULLS LAST, item_id ASC" in sql


@pytest.mark.asyncio
async def test_naming_no_sort_keeps_the_order_this_page_always_had():
    """Adding the capability must not move anything already on screen."""
    v = FakeVault(rows=[{"n": 0}])
    bs._vault, bs._schema_done, bs._backfill_done = v, True, True
    await bs.list_items("npub1a", "blk", "observation")
    assert bs.LEGACY_ORDER in " ".join(v.sql_of("SELECT"))


@pytest.mark.asyncio
async def test_every_sortable_key_is_a_real_column():
    """A key here that names no column is a 500 waiting for whoever clicks it."""
    v = FakeVault(rows=[{"n": 0}])
    bs._vault, bs._schema_done, bs._backfill_done = v, True, True
    ddl = " ".join(bs._DDL) + " " + " ".join(bs._MIGRATIONS)
    for key, expr in bs.SORTABLE.items():
        column = expr.replace("LOWER(", "").replace(")", "").split()[0]
        assert column in ddl, f"SORTABLE[{key!r}] sorts by {column}, which no DDL creates"


def test_search_refuses_a_pattern_long_enough_to_hold_a_connection_open():
    with pytest.raises(bs.BlockError):
        bs.clean_search("x" * (bs.MAX_SEARCH_LEN + 1))
    assert bs.clean_search("  ") == ""
    assert bs.clean_search("migration|arrival") == "migration|arrival"


@pytest.mark.asyncio
async def test_a_search_looks_at_both_the_name_and_the_event():
    v = FakeVault(rows=[{"n": 0}])
    bs._vault, bs._schema_done, bs._backfill_done = v, True, True
    await bs.list_items("npub1a", "blk", "wildlife", search="migration")
    sql = " ".join(v.sql_of("SELECT"))
    assert "name" in sql and "event" in sql and "~*" in sql
    assert "migration" not in sql, "the pattern is a parameter, not text in the query"


# ── Reading across the change ────────────────────────────────────────────


def test_a_converted_row_reads_from_the_clear_column():
    row = {"payload": {"crop": "Zinnia"}, "payload_enc": None}
    assert bs._payload_of(row, "npub1a", "blk") == {"crop": "Zinnia"}


def test_a_driver_that_hands_back_json_as_text_still_reads():
    row = {"payload": json.dumps({"crop": "Dahlia"}), "payload_enc": None}
    assert bs._payload_of(row, "npub1a", "blk") == {"crop": "Dahlia"}


def test_an_unconverted_row_still_reads_from_the_sealed_column():
    """Until the backfill reaches it, an old row must not read as an empty
    item — that would show a farm with nothing on it."""
    bs._cipher = None  # unsealed round-trip: _seal falls through to plain JSON
    row = {"payload": None, "payload_enc": json.dumps({"crop": "Peony"})}
    assert bs._payload_of(row, "npub1a", "blk") == {"crop": "Peony"}


# ── The backfill ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_the_backfill_converts_a_sealed_row_without_touching_it():
    bs._cipher = None
    v = FakeVault(rows=[{
        "npub": "npub1a", "item_id": "itm1", "block_id": "blk",
        "payload_enc": json.dumps({"crop": "Zinnia", "gdd_target": 1100,
                                   "set_out": "2026-05-20"}),
    }])
    bs._vault = v
    await bs._backfill(v)

    updates = [c for c in v.calls if c[0].strip().upper().startswith("UPDATE")]
    assert len(updates) == 1
    sql, params = updates[0]
    assert "payload_enc" not in sql, "the sealed column is left alone, so this is re-runnable"
    assert params[3] == "Zinnia"          # name
    assert params[6] == "2026-05-20"      # starts_on
    assert params[7] == 1100.0            # target_gdd


@pytest.mark.asyncio
async def test_the_backfill_stops_when_there_is_nothing_left():
    v = FakeVault(rows=[])
    bs._vault = v
    await bs._backfill(v)
    assert bs._backfill_done is True
    assert not [c for c in v.calls if c[0].strip().upper().startswith("UPDATE")]


@pytest.mark.asyncio
async def test_a_row_that_will_not_open_is_converted_empty_rather_than_retried_forever():
    """A rotated key leaves rows nothing can read. They keep their bookkeeping
    and stay visible; what they must not do is block every later pass."""
    class Stubborn:
        def decrypt(self, *_a, **_k): raise ValueError("wrong key")
    bs._cipher = Stubborn()
    v = FakeVault(rows=[{"npub": "npub1a", "item_id": "itm1", "block_id": "blk",
                         "payload_enc": "unreadable"}])
    bs._vault = v
    await bs._backfill(v)
    updates = [c for c in v.calls if c[0].strip().upper().startswith("UPDATE")]
    assert len(updates) == 1
    assert updates[0][1][2] == "{}"
    assert bs._backfill_done is True
