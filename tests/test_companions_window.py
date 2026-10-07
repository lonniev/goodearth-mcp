"""Companions assembled from a block's record, with iNaturalist faked."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from goodearth_mcp import biota
from goodearth_mcp import companions_window as cw

TODAY = datetime(2026, 10, 6, tzinfo=UTC)

TAXA = {
    1: {"name": "Solanum lycopersicum", "family": "Solanaceae", "genus": "Solanum"},
    2: {"name": "Phaseolus vulgaris", "family": "Fabaceae", "genus": "Phaseolus"},
    3: {"name": "Brassica oleracea", "family": "Brassicaceae", "genus": "Brassica"},
    4: {"name": "Allium sativum", "family": "Amaryllidaceae", "genus": "Allium"},
}


async def fake_taxa(ids):
    return {i: TAXA[i] for i in ids if i in TAXA}


HERE = [
    {"ref": "t1", "crop": "Tomato · Brandywine", "common_name": "tomato", "taxon_id": 1,
     "flower_color": "yellow", "height_in": 48, "bloom_months": [7, 8]},
    {"ref": "b1", "crop": "Bush bean", "taxon_id": 2, "flower_color": "white", "height_in": 18},
    {"ref": "m1", "crop": "Mystery seedling"},
]
ELSEWHERE = [
    {"ref": "g9", "crop": "Garlic", "taxon_id": 4, "block_name": "Upper"},
    {"ref": "k9", "crop": "Kale", "taxon_id": 3, "block_name": "Upper", "flower_color": "yellow"},
]


def run(plant, kind, here=HERE, elsewhere=ELSEWHERE):
    return asyncio.run(cw.block_companions(plant, kind, here, elsewhere, fetch_taxa=fake_taxa, today=TODAY))


class TestFindingTheSubject:
    def test_by_ref_then_by_unique_name_then_by_part(self):
        assert cw.find_subject("b1", HERE)["ref"] == "b1"
        assert cw.find_subject("tomato", HERE)["ref"] == "t1"
        assert cw.find_subject("Brandy", HERE)["ref"] == "t1"

    def test_a_shared_name_lists_the_refs(self):
        two = [{"ref": "a", "crop": "Kale"}, {"ref": "b", "crop": "Kale"}]
        with pytest.raises(cw.CompanionsError, match="a, b"):
            cw.find_subject("kale", two)

    def test_an_absent_plant_is_an_error_not_an_empty_answer(self):
        with pytest.raises(cw.CompanionsError, match="No planting"):
            cw.find_subject("okra", HERE)


class TestSynergy:
    def test_the_plot_first_then_history_then_examples_each_labelled(self):
        r = run("b1", "synergy")
        assert r["success"] and r["subject"]["family"] == "Fabaceae"
        rows = {row["name"]: row for row in r["companions"]}
        assert rows["tomato"]["where"] == "this_plot" and rows["tomato"]["relation"] == "helps"
        assert rows["Kale"]["where"] == "grown_before" and rows["Kale"]["block"] == "Upper"
        assert rows["Garlic"]["where"] == "grown_before" and rows["Garlic"]["relation"] == "avoid"
        assert rows["pea"]["where"] == "example" and rows["pea"]["relation"] == "watch"
        # A genus already on the ledger keeps its example off the list.
        assert "bush bean" not in rows and "garlic" not in rows

    def test_a_plot_mate_with_no_rule_is_simply_absent(self):
        r = run("t1", "synergy")
        assert "Garlic" not in {row["name"] for row in r["companions"]}

    def test_rows_carry_relation_basis_and_citation(self):
        r = run("t1", "synergy")
        bean = next(row for row in r["companions"] if row["ref"] == "b1")
        assert bean["relation"] == "helped_by" and bean["basis"] == "mechanism" and bean["cite"]

    def test_an_unplaced_planting_is_named_not_guessed(self):
        r = run("t1", "synergy")
        assert [u["ref"] for u in r["unplaced"]] == ["m1"]
        assert "not placed" in r["summary"]

    def test_an_unplaced_subject_is_refused_with_the_fix(self):
        r = run("m1", "synergy")
        assert r["success"] is False and r["error_code"] == "invalid_request"
        assert "species" in r["error"]

    def test_bad_kind_is_an_error(self):
        with pytest.raises(cw.CompanionsError, match="kind"):
            run("t1", "pretty")

    def test_the_fetcher_is_asked_once_for_every_id(self):
        asked: list[set[int]] = []

        async def spy(ids):
            asked.append(set(ids))
            return await fake_taxa(ids)

        asyncio.run(cw.block_companions("t1", "synergy", HERE, ELSEWHERE, fetch_taxa=spy, today=TODAY))
        assert asked == [{1, 2, 3, 4}]


class TestDesign:
    def test_needs_a_colour_on_the_subject(self):
        r = run("m1", "design")
        assert r["success"] is False and r["missing"] == ["flower_color"]

    def test_ranks_by_wheel_then_layers_then_bloom(self):
        r = run("t1", "design")
        assert r["success"] and r["subject"]["color"] == "yellow" and r["subject"]["band"] == "back"
        names = [row["name"] for row in r["companions"]]
        # larkspur (violet, back) is complementary but same band; the white
        # bean on the plot is a foil in a different band.
        assert names[0] == "larkspur"
        bean = next(row for row in r["companions"] if row["ref"] == "b1")
        assert bean["relation"] == "foil" and bean["layers"] is True
        assert {u["ref"] for u in r["unplaced"]} == {"m1", "g9"}

    def test_design_never_calls_inaturalist(self):
        async def boom(ids):
            raise AssertionError("design must not fetch taxa")

        r = asyncio.run(cw.block_companions("t1", "design", HERE, ELSEWHERE, fetch_taxa=boom, today=TODAY))
        assert r["success"]


class TestTaxaLineage:
    def test_family_and_genus_come_from_the_ancestors(self):
        rec = biota._lineage({
            "id": 1, "name": "Solanum lycopersicum", "rank": "species",
            "preferred_common_name": "Tomato",
            "ancestors": [{"rank": "family", "name": "Solanaceae"}, {"rank": "genus", "name": "Solanum"}],
        })
        assert rec["family"] == "Solanaceae" and rec["genus"] == "Solanum" and rec["common_name"] == "Tomato"

    def test_a_family_rank_taxon_is_its_own_family(self):
        assert biota._lineage({"id": 2, "name": "Fabaceae", "rank": "family", "ancestors": []})["family"] == "Fabaceae"
