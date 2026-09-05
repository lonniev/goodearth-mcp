"""The tree year, assembled against a block.

Two sources that must not be able to cost each other: USA-NPN goes out of
season and answers with an exception document, and a sugarbush still wants its
sap run when it does.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta

import pytest

from goodearth_mcp import biota, block_store, record_cache, tree_year_window
from goodearth_mcp import region as reg

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 3, 20)

# Measured at Panton VT on 2026-09-04.
PANTON = {
    "first_leaf": 101.33333587646484,
    "first_bloom": 139.0,
    "normal_leaf": 108.0,
    "normal_bloom": 135.20741271972656,
}

MAPLE = {"crop": "Maple · sugar"}
APPLE = {"crop": "Apple"}


def _season(start: str, end: str, sap: tuple[str, ...] = ()) -> dict:
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=i) for i in range((b - a).days + 1)]
    return {
        "daily": {
            "time": [d.isoformat() for d in days],
            "temperature_2m_max": [45.0 if d.isoformat() in sap else 50.0 for d in days],
            "temperature_2m_min": [24.0 if d.isoformat() in sap else 38.0 for d in days],
        },
        "_feed": {"name": "synthetic (test)", "resolution_m": 1000},
    }


SAP_DAYS = ("2026-03-08", "2026-03-12", "2026-03-18")


@pytest.fixture(autouse=True)
def _ground(monkeypatch):
    async def daily(lats, lons, start, end):
        return [_season(start, end, SAP_DAYS) for _ in (lats or [0])]

    async def index(lat, lon):
        return dict(PANTON)

    monkeypatch.setattr(record_cache, "daily_history", daily)
    monkeypatch.setattr(biota, "fetch_spring_index", index)
    yield


def run(plants, **kw):
    return asyncio.run(
        tree_year_window.region_tree_year(REGION, plants, today=kw.pop("today", TODAY))
    )


# ── Spring, dated for this ground ────────────────────────────────────────


def test_spring_is_dated_and_set_against_its_own_normal():
    out = run([APPLE])
    assert out["spring"]["first_leaf"]["on"] == "2026-04-11"
    assert out["spring"]["first_leaf"]["days_from_normal"] == -7
    assert "7 days early" in out["summary"]


def test_the_note_says_bloom_is_pollen_without_forecasting_pollen():
    """The owner asked for pollen. What is honest is that first bloom IS when
    it starts; what would not be is a pollen forecast off a feed that does not
    exist."""
    note = run([APPLE])["note"]
    assert "pollen" in note
    assert "no pollen feed" in note


# ── The sap run, and who gets one ────────────────────────────────────────


def test_a_block_with_maple_gets_its_sap_run():
    out = run([MAPLE, APPLE])
    assert out["tapped"] == ["Maple · sugar"]
    assert out["sap"]["state"] == "running"
    assert out["sap"]["cycles"] == 3
    assert out["sap"]["started_on"] == "2026-03-08"


def test_a_block_with_nothing_tappable_gets_no_sap_section():
    """The count would be just as true on a block of apples, and reporting it
    there answers a question nobody on that ground asked."""
    out = run([APPLE])
    assert out["tapped"] == []
    assert out["sap"] is None


def test_a_block_with_no_saved_plants_at_all_still_answers_for_spring():
    out = run([])
    assert out["spring"]["first_leaf"]["on"] == "2026-04-11"
    assert out["sap"] is None


# ── Neither source may cost the other ────────────────────────────────────


def test_npn_out_of_season_does_not_cost_the_sap_run(monkeypatch):
    """NPN answers with an XML exception document out of season. A sugarmaker
    in March must still be told what the sap did."""
    async def down(lat, lon):
        raise biota.BiotaError("USA-NPN capabilities unreachable")

    monkeypatch.setattr(biota, "fetch_spring_index", down)
    out = run([MAPLE])
    assert out["spring"] is None
    assert out["sap"]["cycles"] == 3


def test_a_weather_feed_outage_does_not_cost_the_spring_index(monkeypatch):
    async def down(lats, lons, start, end):
        raise OSError("archive down")

    monkeypatch.setattr(record_cache, "daily_history", down)
    out = run([MAPLE])
    assert out["spring"]["first_leaf"]["on"] == "2026-04-11"
    assert out["sap"] is None
    assert "sap_error" in out


def test_losing_BOTH_is_an_error_rather_than_a_cheerful_empty_answer(monkeypatch):
    async def no_weather(lats, lons, start, end):
        raise OSError("archive down")

    async def no_index(lat, lon):
        raise biota.BiotaError("down")

    monkeypatch.setattr(record_cache, "daily_history", no_weather)
    monkeypatch.setattr(biota, "fetch_spring_index", no_index)
    with pytest.raises(tree_year_window.TreeYearError):
        run([MAPLE])


def test_both_sources_are_named_in_the_answer():
    out = run([MAPLE])
    roles = {s["role"] for s in out["sources"]}
    assert roles == {"first leaf and bloom", "sap run"}


def test_nothing_to_say_is_not_charged_for(monkeypatch):
    """`paid_tool` debits before the body and rolls back only on an exception.
    A block with nothing tappable and no spring index would otherwise take the
    fare and hand back four nulls."""
    async def down(lat, lon):
        raise biota.BiotaError("down")

    monkeypatch.setattr(biota, "fetch_spring_index", down)
    with pytest.raises(tree_year_window.TreeYearError):
        run([APPLE])


def test_the_sap_run_reads_the_kind_the_record_actually_uses():
    """A guard for a bug that shipped: the tool asked `_stored_items` for kind
    "crop" where the record has always written "planting", so `tapped` was
    always empty and the sap section could never appear.

    Asserted against the server module rather than restated here, because the
    two drifting apart is the whole fault.
    """
    import inspect

    from goodearth_mcp import server

    src = inspect.getsource(server.tree_year)
    assert '"planting"' in src
    assert '_stored_items(npub, found["block_id"], "crop")' not in src


# ── Per-species, which is where pollen and leaf colour actually live ──────


MAPLE_NAMED = {"crop": "Maple · sugar", "scientific_name": "Acer saccharum"}
OAK_NAMED = {"crop": "Oak · red", "scientific_name": "Quercus rubra"}


@pytest.fixture
def _npn_species(monkeypatch):
    """USA-NPN's per-species table, stubbed with what it really returns."""
    asked: list[list[str]] = []

    async def phenophases(names, today=None):
        asked.append(list(names))
        return [
            {"scientific_name": n, "common_name": n.lower(), "tracked": True,
             "habits": ["Breaking leaf buds", "Open flowers", "Pollen release",
                        "Colored leaves", "Falling leaves"]}
            for n in names
        ]

    monkeypatch.setattr(tree_year_window.catalog, "species_phenophases", phenophases)
    return asked


def test_each_tree_is_answered_for_by_name(_npn_species):
    """The Spring Index dates ONE leaf-out for the block. Pollen release and
    leaf colour are per-species, and this is the half that carries them."""
    out = run([MAPLE_NAMED, OAK_NAMED])
    assert [s["scientific_name"] for s in out["species"]] == [
        "Acer saccharum", "Quercus rubra"]
    assert "Pollen release" in out["species"][0]["habits"]
    assert "Colored leaves" in out["species"][0]["habits"]


def test_the_growers_own_word_travels_with_the_binomial(_npn_species):
    """They saved "Maple · sugar". Being answered about Acer saccharum alone
    would make them pair the two up by eye."""
    out = run([MAPLE_NAMED])
    assert out["species"][0]["crop"] == "Maple · sugar"


def test_a_plant_with_no_resolved_name_is_not_asked_about(_npn_species):
    """A crop the grower typed carries no binomial, and USA-NPN has no row for
    "Maple · sugar" — asking anyway would spend a call to be told nothing."""
    run([MAPLE, APPLE])
    assert _npn_species == [[]]


def test_the_same_species_twice_is_asked_about_once(_npn_species):
    """Two rows of sugar maple are two plantings and one species."""
    run([MAPLE_NAMED, {**MAPLE_NAMED, "crop": "Maple · sugar (north lot)"}])
    assert _npn_species == [["Acer saccharum"]]


def test_npn_species_failing_does_not_cost_spring_or_the_sap_run(monkeypatch):
    """Three feeds, and no one of them may take the others down with it."""
    async def down(names, today=None):
        raise biota.BiotaError("USA-NPN species table unreachable")

    monkeypatch.setattr(tree_year_window.catalog, "species_phenophases", down)
    out = run([MAPLE_NAMED])
    assert out["species"] == []
    assert out["spring"]["first_leaf"]["on"] == "2026-04-11"
    assert out["sap"]["cycles"] == 3


def test_the_species_source_is_named_only_when_it_answered(_npn_species):
    named = [s["name"] for s in run([MAPLE_NAMED])["sources"]]
    assert "USA-NPN species phenophases" in named
    assert "USA-NPN species phenophases" not in [
        s["name"] for s in run([APPLE])["sources"]]
