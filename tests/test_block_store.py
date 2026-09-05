"""The block store's pure surface, and the two bugs it exists not to repeat."""

from __future__ import annotations

import pytest

from goodearth_mcp import block_store as bs
from goodearth_mcp import task_store as ts

# ── Names and the blind index ────────────────────────────────────────────


def test_norm_folds_case_accents_and_spacing():
    assert bs.norm("  Frogdale   FARM ") == "frogdale farm"
    assert bs.norm("Café Field") == "cafe field"


def test_lookup_key_is_deterministic_and_scoped_to_its_owner():
    a = bs.lookup_key("npub1aaa", "Frogdale Farm")
    assert a == bs.lookup_key("npub1aaa", "  frogdale   farm  ")
    # The same name from another grower must not collide into their row, or the
    # UNIQUE(npub, lookup_key) constraint would reject a name somebody else used.
    assert a != bs.lookup_key("npub1bbb", "Frogdale Farm")


def test_lookup_key_does_not_leak_the_name():
    assert "frogdale" not in bs.lookup_key("npub1aaa", "Frogdale Farm")


# ── Ids ──────────────────────────────────────────────────────────────────


def test_new_block_id_mints_when_none_is_asked_for():
    assert len(bs.new_block_id()) == 32
    assert bs.new_block_id() != bs.new_block_id()


@pytest.mark.parametrize("legacy", ["pin-m1a2b3", "poly-abc123", "map-zz9"])
def test_migrating_browser_ids_are_accepted(legacy):
    assert bs.new_block_id(legacy) == legacy


@pytest.mark.parametrize("bad", ["haxx", "../../etc/passwd", "pin-", "PIN-ABC", "pin-" + "z" * 40])
def test_any_other_requested_id_is_refused(bad):
    """An id is the primary key. A caller may not simply choose one."""
    with pytest.raises(bs.BlockError):
        bs.new_block_id(bad)


def test_the_example_id_is_reserved():
    with pytest.raises(bs.BlockError):
        bs.new_block_id(bs.EXAMPLE_BLOCK_ID)


# ── Kinds, dates, aliases ────────────────────────────────────────────────


@pytest.mark.parametrize("kind", bs.KINDS)
def test_every_declared_kind_is_accepted(kind):
    assert bs._clean_kind(kind.upper()) == kind


def test_an_unknown_kind_is_refused():
    with pytest.raises(bs.BlockError):
        bs._clean_kind("tractor")


def test_a_day_must_be_a_day():
    assert bs._clean_day("2026-05-04T12:00:00Z", "observed_on") == "2026-05-04"
    assert bs._clean_day("", "observed_on") is None
    with pytest.raises(bs.BlockError):
        bs._clean_day("last tuesday", "observed_on")


def test_aliases_are_cleaned_but_not_counted():
    """How many names a grower has for their own ground is theirs. The shape
    is still checked — a string is not a list of aliases — and each one is
    still trimmed to a sane length; what is gone is the cap at twelve."""
    assert bs._clean_aliases(["North", "  ", "north field"]) == ["North", "north field"]
    assert len(bs._clean_aliases(["a"] * 50)) == 50
    with pytest.raises(bs.BlockError):
        bs._clean_aliases("not a list")


def test_a_block_needs_a_name():
    with pytest.raises(bs.BlockError):
        bs._clean_name("   ")


# ── Sealing ──────────────────────────────────────────────────────────────


class _Cipher:
    """Stands in for VaultCipher: records the AAD it was handed."""

    def __init__(self):
        self._key = b"k" * 32

    def encrypt(self, plaintext, aad=""):
        return f"enc:{aad}:{plaintext}"

    def decrypt(self, value, aad=""):
        head, got, rest = value.split(":", 2)
        if head != "enc" or got != aad:
            raise ValueError("aad mismatch")
        return rest


def test_payloads_round_trip_through_the_cipher(monkeypatch):
    monkeypatch.setattr(bs, "_cipher", _Cipher())
    sealed = bs._seal({"crop": "garlic"}, "npub1aaa", "blk1")
    assert "garlic" not in sealed.split(":", 2)[1]  # not in the AAD
    assert bs._open(sealed, "npub1aaa", "blk1") == {"crop": "garlic"}


def test_a_payload_will_not_open_for_another_patron(monkeypatch):
    """AAD binds a ciphertext to its owner, so a lifted row does not decrypt."""
    monkeypatch.setattr(bs, "_cipher", _Cipher())
    sealed = bs._seal({"crop": "garlic"}, "npub1aaa", "blk1")
    assert bs._open(sealed, "npub1eve", "blk1", default="REFUSED") == "REFUSED"
    assert bs._open(sealed, "npub1aaa", "other", default="REFUSED") == "REFUSED"


def test_an_unreadable_payload_does_not_take_out_the_listing(monkeypatch):
    monkeypatch.setattr(bs, "_cipher", _Cipher())
    assert bs._open("garbage", "npub1aaa", "blk1", default={}) == {}


# ── Schema qualification ─────────────────────────────────────────────────


class _Vault:
    def _t(self, table):
        return f"tenant7.{table}"


def test_qualifying_points_both_tables_at_the_schema(monkeypatch):
    monkeypatch.setattr(bs, "_vault", _Vault())
    sql = f"SELECT * FROM {bs.ITEMS} JOIN {bs.BLOCKS} USING (block_id)"
    out = bs._t(sql)
    assert "tenant7.goodearth_block_items" in out
    assert "tenant7.goodearth_blocks" in out


def test_qualifying_never_touches_an_index_name(monkeypatch):
    """The bug this store exists not to repeat.

    CREATE INDEX takes a bare identifier, so a qualified index NAME is a syntax
    error — which aborts the DDL loop, leaves the schema flag False, and makes
    every later request re-run the whole block.
    """
    monkeypatch.setattr(bs, "_vault", _Vault())
    for stmt in bs._MIGRATIONS:
        out = bs._t(stmt)
        assert "tenant7.ge_" not in out
    # And the same property in task_store, where it was found.
    monkeypatch.setattr(ts, "_vault", type("V", (), {"_schema_prefix": "tenant7."})())
    for stmt in ts._MIGRATIONS:
        assert "tenant7.goodearth_tasks_owner_idx" not in ts._qualify(stmt)


def test_qualifying_is_a_no_op_without_a_schema(monkeypatch):
    monkeypatch.setattr(bs, "_vault", object())
    sql = f"SELECT * FROM {bs.BLOCKS}"
    assert bs._t(sql) == sql


# ── The upsert guard ─────────────────────────────────────────────────────


def test_every_upsert_rescopes_to_the_owner_on_the_update_path():
    """ON CONFLICT ... DO UPDATE is unscoped unless it says so.

    Ids are guessable — the migrating ones are minted from a millisecond clock
    — so an upsert whose UPDATE arm omits the owner check lets a caller
    overwrite somebody else's row by supplying their id.
    """
    import inspect

    for module, needle in ((bs, "npub = EXCLUDED.npub"), (ts, "npub = EXCLUDED.npub")):
        src = inspect.getsource(module)
        conflicts = src.count("ON CONFLICT")
        assert conflicts > 0
        assert src.count(needle) >= conflicts, (
            f"{module.__name__} has {conflicts} upserts but only "
            f"{src.count(needle)} owner guards"
        )
