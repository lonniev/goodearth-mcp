"""Forget me — and the guard that stops a table being left behind.

The failure mode here is OMISSION, and it is silent. A table added next season
and not swept leaves a patron's rows under a name nobody remembers, nothing
raises, and the answer quietly is not "gone" — it just says so.

So the coverage assertion is mechanical: find every `goodearth_*` table this
package declares, and require the sweep to reach it. Written this way because
the same fault — fixing what was found instead of auditing what exists — got
through twice in one week on the front end's storage keys.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

from goodearth_mcp import forget

PKG = Path(__file__).resolve().parents[1] / "src/goodearth_mcp"


def declared_tables() -> dict[str, str]:
    """Every `goodearth_*` table name this package assigns to a constant."""
    found: dict[str, str] = {}
    for py in PKG.glob("*.py"):
        for const, table in re.findall(
            r'^([A-Z][A-Z_]*)\s*=\s*"(goodearth_[a-z_]+)"', py.read_text(), re.MULTILINE
        ):
            found[table] = f"{py.stem}.{const}"
    return found


# ── The guard ────────────────────────────────────────────────────────────


def test_the_scan_actually_finds_the_tables():
    """A guard on the guard. A regex that matched nothing would make the
    coverage assertion below vacuously true."""
    tables = declared_tables()
    assert len(tables) >= 5, f"only found {tables}"
    assert "goodearth_blocks" in tables
    assert "goodearth_weather_cache" in tables


def test_every_table_of_a_patron_s_own_rows_is_swept():
    """THE LOAD-BEARING ONE. Add a table, forget this sweep, and this fails."""
    swept = set()
    for store in forget.STORES:
        for const in ("BLOCKS", "ITEMS", "TABLE", "CACHE"):
            name = getattr(store, const, None)
            if isinstance(name, str) and name.startswith("goodearth_"):
                swept.add(name)

    missing = set(declared_tables()) - swept
    assert not missing, (
        f"{sorted(missing)} hold rows keyed to a patron and no store in "
        f"forget.STORES sweeps them"
    )


def test_every_store_in_the_registry_can_actually_forget():
    for store in forget.STORES:
        assert callable(getattr(store, "forget_everything", None)), store.__name__


# ── The confirmation ─────────────────────────────────────────────────────


def run(**kw):
    return asyncio.run(forget.everything(**kw))


def test_it_refuses_without_the_exact_words():
    """`confirm=true` is what an agent sends by reflex when a schema asks for
    a boolean. This is the one call in the service that cannot be taken back,
    so it wants a sentence nobody types by accident."""
    for wrong in ("", "yes", "true", "forget my ground", "FORGET ME"):
        with pytest.raises(forget.ForgetError):
            run(npub="npub1x", confirm=wrong)


def test_the_refusal_says_what_would_go_AND_what_would_not():
    """Someone is about to be told their data is deleted. They are owed both
    halves before they decide, not after."""
    with pytest.raises(forget.ForgetError) as e:
        run(npub="npub1x", confirm="")
    said = str(e.value)
    assert "cannot be undone" in said
    assert "calendar feed" in said
    assert "balance" in said and "stay a patron" in said


def test_it_refuses_when_it_does_not_know_whose_ground():
    with pytest.raises(forget.ForgetError):
        run(npub="", confirm=forget.CONFIRM_PHRASE)


# ── What it does ─────────────────────────────────────────────────────────


@pytest.fixture
def swept(monkeypatch):
    """Each store records the npub it was asked to forget."""
    seen: dict[str, str] = {}

    def stub(store, table):
        async def forget_everything(npub: str) -> dict[str, int]:
            seen[store.__name__] = npub
            return {table: 3}
        return forget_everything

    for store, table in (
        (forget.block_store, "goodearth_blocks"),
        (forget.task_store, "goodearth_tasks"),
        (forget.feed_store, "goodearth_calendar_feeds"),
        (forget.record_cache, "goodearth_weather_cache"),
    ):
        monkeypatch.setattr(store, "forget_everything", stub(store, table))
    return seen


def test_the_right_words_sweep_every_store(swept):
    out = run(npub="npub1x", confirm=forget.CONFIRM_PHRASE)
    assert set(swept) == {s.__name__ for s in forget.STORES}
    assert all(v == "npub1x" for v in swept.values())
    assert out["success"] is True


def test_it_reports_what_went_rather_than_reassuring(swept):
    """A count per table, so "gone" is checkable."""
    out = run(npub="npub1x", confirm=forget.CONFIRM_PHRASE)
    assert out["rows"] == 12
    assert out["forgotten"]["goodearth_calendar_feeds"] == 3


def test_it_says_the_feed_stops_resolving(swept):
    """A published token left behind is a live link to a farm that asked to be
    forgotten, so its going is stated rather than implied."""
    assert "stopped resolving" in run(npub="npub1x", confirm=forget.CONFIRM_PHRASE)["note"]


def test_it_says_the_patron_remains_one(swept):
    """The owner's ruling: the npub stays a patron of the operator and no
    Tollbooth data is touched. It is the plots and farm data that go."""
    note = run(npub="npub1x", confirm=forget.CONFIRM_PHRASE)["note"]
    assert "still" in note and "patron" in note
    assert "balance" in note
