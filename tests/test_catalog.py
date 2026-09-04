"""Regional catalogues — what may honestly be shown, and what is withheld."""

from __future__ import annotations

import asyncio
from datetime import date

import pytest

from goodearth_mcp import biota, catalog
from goodearth_mcp.region import parse_region

PIN = {"lat": 44.4813, "lon": -73.2083, "radius_m": 400}
FIELD = {
    "type": "Polygon",
    "coordinates": [[[-73.2100, 44.4800], [-73.2065, 44.4800],
                     [-73.2065, 44.4827], [-73.2100, 44.4827], [-73.2100, 44.4800]]],
}


def test_search_box_widens_a_field_to_a_neighbourhood():
    """A hayfield holds no observations of anything.

    Asking a 9 ha bounding box returned 34 birds and zero amphibians while
    the surrounding country holds barred owl, coyote and three bats. Species
    are a landscape fact even though heat is not.
    """
    region = parse_region(FIELD)
    box = catalog.search_box(region)
    assert box[0] < region.bbox[0] and box[2] > region.bbox[2]
    span_km = (box[2] - box[0]) * 111.32
    assert span_km > 10


def test_search_box_never_shrinks_a_region_already_larger():
    big = parse_region({"lat": 44.5, "lon": -73.2, "radius_m": 40_000})
    box = catalog.search_box(big)
    assert box[0] <= big.bbox[0] and box[2] >= big.bbox[2]


@pytest.mark.asyncio
async def test_pest_catalog_only_dates_layers_measured_as_day_of_year(monkeypatch):
    """The heat sums must not become dates.

    winter_wheat reads 281 on this ground — a convincing 8 October, and
    actually accumulated heat. It is counted as unreadable, never rendered.
    """
    async def models():
        return ["japanese_beetle_adult", "winter_wheat", "monilinia"]

    async def classify(layer):
        return {
            "japanese_beetle_adult": biota.DAY_OF_YEAR,
            "winter_wheat": biota.ACCUMULATED_GDD,
            "monilinia": biota.INDEX,
        }[layer]

    async def point(layer, lat, lon):
        return {"japanese_beetle_adult": 191.0}.get(layer)

    async def species(box, taxon, limit=40):
        return []

    monkeypatch.setattr(biota, "fetch_npn_models", models)
    monkeypatch.setattr(biota, "classify_npn_layer", classify)
    monkeypatch.setattr(biota, "fetch_npn_point", point)
    monkeypatch.setattr(biota, "fetch_inat_species", species)
    catalog._roster = None
    catalog._encoding.clear()

    out = await catalog.region_pest_catalog(parse_region(PIN), today=date(2026, 8, 31))
    assert [e["name"] for e in out["events"]] == ["Japanese beetle adult"]
    assert out["events"][0]["date"] == "2026-07-10"
    assert out["events"][0]["passed"] is True
    assert out["models_published"] == 3
    assert out["models_unreadable"] == 2


@pytest.mark.asyncio
async def test_pest_catalog_never_probes_a_layer_it_could_not_show(monkeypatch):
    """Unreadable layers cost no upstream call — the classification is free."""
    probed: list[str] = []

    async def models():
        return ["japanese_beetle_adult", "winter_wheat"]

    async def classify(layer):
        return biota.DAY_OF_YEAR if layer == "japanese_beetle_adult" else biota.ACCUMULATED_GDD

    async def point(layer, lat, lon):
        probed.append(layer)
        return 191.0

    async def species(box, taxon, limit=40):
        return []

    monkeypatch.setattr(biota, "fetch_npn_models", models)
    monkeypatch.setattr(biota, "classify_npn_layer", classify)
    monkeypatch.setattr(biota, "fetch_npn_point", point)
    monkeypatch.setattr(biota, "fetch_inat_species", species)
    catalog._roster = None
    catalog._encoding.clear()

    await catalog.region_pest_catalog(parse_region(PIN), today=date(2026, 8, 31))
    assert probed == ["japanese_beetle_adult"]


@pytest.mark.asyncio
async def test_wildlife_catalog_groups_and_reports_its_search_width(monkeypatch):
    async def species(box, taxon, limit=40):
        return [{"name": f"{taxon} sp.", "observations": 5, "source": "iNaturalist"}]

    # The species index is a SECOND feed, and it is not the subject here. Left
    # unstubbed it reached USA-NPN for real: harmless-looking, because the
    # caller swallows a BiotaError and returns {}, but it made these two tests
    # depend on that service being up. The file's own convention, from
    # test_species_habits below.
    async def _index():
        return {}
    monkeypatch.setattr(biota, "fetch_npn_species_index", _index)
    catalog._npn_index = None

    monkeypatch.setattr(biota, "fetch_inat_species", species)
    out = await catalog.region_wildlife_catalog(parse_region(FIELD))
    assert [g["group"] for g in out["groups"]] == ["Birds", "Mammals", "Amphibians", "Reptiles"]
    assert out["species_total"] == 4
    # The footprint searched is wider than the farm, and must say so.
    assert out["search_span_km"] > 10
    assert "landscape" in out["note"]


@pytest.mark.asyncio
async def test_wildlife_catalog_names_a_group_that_failed(monkeypatch):
    """A feed outage shortens the list; saying which group went missing is
    the difference between 'no reptiles here' and 'reptiles did not load'."""
    async def species(box, taxon, limit=40):
        if taxon == "Reptilia":
            raise biota.BiotaError("iNaturalist timed out")
        return [{"name": f"{taxon} sp.", "observations": 1, "source": "iNaturalist"}]

    # The species index is a SECOND feed, and it is not the subject here. Left
    # unstubbed it reached USA-NPN for real: harmless-looking, because the
    # caller swallows a BiotaError and returns {}, but it made these two tests
    # depend on that service being up. The file's own convention, from
    # test_species_habits below.
    async def _index():
        return {}
    monkeypatch.setattr(biota, "fetch_npn_species_index", _index)
    catalog._npn_index = None

    monkeypatch.setattr(biota, "fetch_inat_species", species)
    out = await catalog.region_wildlife_catalog(parse_region(FIELD))
    assert out["unavailable"] == ["Reptiles"]
    assert len(out["groups"]) == 3


def test_layer_names_read_as_english():
    assert catalog._humanise("eab_egg_hatch") == "Emerald ash borer egg hatch"
    assert catalog._humanise("slf_adult") == "Spotted lanternfly adult"
    assert catalog._humanise("japanese_beetle_adult") == "Japanese beetle adult"


def test_mortality_phenophases_are_left_out():
    """NPN tracks deaths; a farm calendar is not the place for them.

    A research network needs "Dead nestlings or fledglings". A grower opening
    a page of things to look forward to does not need an entry offering to
    time the death of the robins.
    """
    kept = catalog.drop_mortality([
        "Live individuals", "Nest building", "Nestlings", "Fledged young",
        "Dead individuals", "Dead nestlings or fledglings",
    ])
    assert kept == ["Live individuals", "Nest building", "Nestlings", "Fledged young"]


def test_dropping_mortality_keeps_everything_else():
    assert catalog.drop_mortality(["Calls or song"]) == ["Calls or song"]
    assert catalog.drop_mortality([]) == []


@pytest.mark.asyncio
async def test_untracked_species_says_so_rather_than_returning_nothing(monkeypatch):
    """"Not tracked" and "does nothing" are different claims.

    Big Brown Bat is recorded around this farm and is absent from USA-NPN.
    An empty list with no explanation would read as the bat having no habits.
    """
    async def index():
        return {"strix varia": {"species_id": 1122, "common_name": "Barred Owl"}}

    monkeypatch.setattr(biota, "fetch_npn_species_index", index)
    catalog._npn_index = None
    out = await catalog.region_species_habits("Eptesicus fuscus")
    assert out["tracked"] is False
    assert out["habits"] == []
    assert "does not track" in out["note"]


# ── The ground's own plant list ──────────────────────────────────────────


def test_the_plant_catalogue_is_the_GROUND_S_list_not_the_library_s(monkeypatch):
    """The crop library is hand-written and the same everywhere. This is what
    people have actually observed near this block."""
    async def inat(box, taxa, limit):
        assert taxa == "Plantae"
        return [
            {"name": "eastern white pine", "scientific_name": "Pinus strobus",
             "observations": 29},
            {"name": "bur oak", "scientific_name": "Quercus macrocarpa",
             "observations": 28},
        ]

    monkeypatch.setattr(biota, "fetch_inat_species", inat)
    out = asyncio.run(catalog.region_plant_catalog(parse_region(PIN)))
    assert [p["name"] for p in out["plants_recorded"]] == [
        "eastern white pine", "bur oak"]
    assert out["search_span_km"] > 0


def test_it_says_how_wide_it_looked(monkeypatch):
    """A nine-hectare hayfield holds almost no observations, so the search is
    padded to a neighbourhood. Reporting that footprint as the farm would be
    the dishonest version."""
    async def inat(box, taxa, limit):
        span = (box[2] - box[0]) * 111_320.0
        assert span >= 2 * catalog.SEARCH_MIN_HALF_SPAN_M
        return []

    monkeypatch.setattr(biota, "fetch_inat_species", inat)
    out = asyncio.run(catalog.region_plant_catalog(parse_region(PIN)))
    assert out["search_span_km"] >= 16


def test_it_adds_no_claim_the_feed_did_not_make(monkeypatch):
    """iNaturalist does not say which of these is a tree or which is a weed.
    Ranking buckthorn as invasive, or splitting woody from herbaceous, would
    be this file inventing a classification."""
    async def inat(box, taxa, limit):
        return [{"name": "common buckthorn", "scientific_name": "Rhamnus cathartica",
                 "observations": 32}]

    monkeypatch.setattr(biota, "fetch_inat_species", inat)
    out = asyncio.run(catalog.region_plant_catalog(parse_region(PIN)))
    [row] = out["plants_recorded"]
    for verdict in ("invasive", "weed", "woody", "native", "habit"):
        assert verdict not in row
    assert "does not say" in out["note"]


def test_a_feed_outage_is_an_error_rather_than_an_empty_meadow(monkeypatch):
    """An empty list reads as "nothing grows near you", which is never true."""
    async def down(box, taxa, limit):
        raise biota.BiotaError("iNaturalist unreachable")

    monkeypatch.setattr(biota, "fetch_inat_species", down)
    with pytest.raises(catalog.CatalogError):
        asyncio.run(catalog.region_plant_catalog(parse_region(PIN)))
