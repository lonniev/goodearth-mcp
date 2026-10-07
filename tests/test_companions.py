"""The companion rules and the design arithmetic, as pure functions.

A rule that cannot be read off a table is this file's opinion; these tests
read the table back and check the arithmetic a Master Gardener would.
"""

from __future__ import annotations

import pytest

from goodearth_mcp import companions as c
from goodearth_mcp.companions import Look, Taxon

TOMATO = Taxon("tomato", "Solanaceae", "Solanum", "Solanum lycopersicum", 1)
BEAN = Taxon("bush bean", "Fabaceae", "Phaseolus", "Phaseolus vulgaris", 2)
KALE = Taxon("kale", "Brassicaceae", "Brassica", "Brassica oleracea", 3)
GARLIC = Taxon("garlic", "Amaryllidaceae", "Allium", "Allium sativum", 4)
WALNUT = Taxon("black walnut", "Juglandaceae", "Juglans", "Juglans nigra", 5)
PEPPER = Taxon("pepper", "Solanaceae", "Capsicum", "Capsicum annuum", 6)
UNPLACED = Taxon("mystery", None, None, None, None)


def relations(a: Taxon, b: Taxon) -> set[str]:
    return {r["relation"] for r in c.relate(a, b)}


class TestRulesReadFromTheSubjectsSide:
    def test_a_bean_feeds_a_tomato(self):
        assert relations(TOMATO, BEAN) == {"helped_by"}
        assert relations(BEAN, TOMATO) == {"helps"}

    def test_garlic_and_bean_keep_apart_both_ways(self):
        assert relations(GARLIC, BEAN) == {"avoid"}
        assert relations(BEAN, GARLIC) == {"avoid"}

    def test_walnut_poisons_anything_placed(self):
        assert relations(TOMATO, WALNUT) == {"avoid"}
        assert relations(WALNUT, KALE) == {"avoid"}

    def test_the_same_family_is_a_watch_not_a_verdict(self):
        assert relations(TOMATO, PEPPER) == {"watch"}

    def test_an_unplaced_plant_gets_no_rule_at_all(self):
        assert c.relate(TOMATO, UNPLACED) == []
        assert c.relate(UNPLACED, TOMATO) == []

    def test_every_rule_names_its_basis_and_a_citation(self):
        for rule in (*c.RULES, c.SAME_FAMILY):
            assert rule.basis in ("mechanism", "tradition")
            assert rule.cite and rule.why

    def test_every_example_is_placed(self):
        for ex in c.EXAMPLES:
            assert ex.family and ex.genus and ex.scientific_name


class TestSynergyOrdering:
    def test_helpers_before_warnings_and_facts_travel(self):
        rows = c.synergy(TOMATO, [
            (WALNUT, {"name": "walnut", "where": "this_plot", "ref": "w"}),
            (BEAN, {"name": "bean", "where": "grown_before", "ref": "b"}),
            (PEPPER, {"name": "pepper", "where": "this_plot", "ref": "p"}),
        ])
        assert [r["relation"] for r in rows] == ["helped_by", "avoid", "watch"]
        assert rows[0]["ref"] == "b" and rows[0]["family"] == "Fabaceae"

    def test_the_subject_itself_is_not_its_own_companion(self):
        rows = c.synergy(TOMATO, [(TOMATO, {"name": "tomato", "where": "this_plot", "ref": "t"})])
        assert rows == []


class TestColourWheel:
    @pytest.mark.parametrize("a,b,rel", [
        ("yellow", "violet", "complementary"),
        ("red", "green", "complementary"),
        ("orange", "blue", "complementary"),
        ("red", "orange", "analogous"),
        ("violet", "red", "analogous"),
        ("red", "yellow", "other"),
        ("red", "red", "same"),
        ("pink", "green", "complementary"),
        ("white", "blue", "foil"),
        ("blue", "white", "foil"),
    ])
    def test_relations(self, a, b, rel):
        assert c.colour_relation(a, b) == rel

    def test_unknown_is_none_not_a_guess(self):
        assert c.colour_relation(None, "red") is None
        assert c.colour_relation("red", "chartreuse") is None

    def test_bands(self):
        assert [c.band(h) for h in (6, 12, 29.9, 30, 90, None)] == ["front", "mid", "mid", "back", "back", None]

    def test_bloom_overlap(self):
        assert c.bloom_overlap([6, 7, 8], [8, 9]) == [8]
        assert c.bloom_overlap([6], [9]) == []
        assert c.bloom_overlap([6], None) is None


class TestDesignRanking:
    def test_complementary_layered_overlapping_first(self):
        subject = Look("yellow", 20, (7, 8))
        rows = c.design(subject, [
            (Look("yellow", 20, (7,)), {"name": "same", "where": "this_plot"}),
            (Look("violet", 36, (8,)), {"name": "best", "where": "example"}),
            (Look("violet", 36, (3,)), {"name": "off-season", "where": "example"}),
            (Look("white", 6, ()), {"name": "foil", "where": "grown_before"}),
            (Look(None, 20, ()), {"name": "uncoloured", "where": "this_plot"}),
        ])
        assert [r["name"] for r in rows] == ["best", "off-season", "foil", "same"]
        assert rows[0]["layers"] is True and rows[0]["bloom_overlap"] == [8]
        assert rows[3]["layers"] is False and "side by side" in rows[3]["why"]

    def test_layers_is_unknown_without_two_heights(self):
        rows = c.design(Look("red"), [(Look("green", 30), {"name": "x", "where": "example"})])
        assert rows[0]["layers"] is None and rows[0]["bloom_overlap"] is None


class TestValidateLook:
    def test_absent_is_absent(self):
        assert c.validate_look({"crop": "kale"}) == {"crop": "kale"}

    @pytest.mark.parametrize("bad", [
        {"flower_color": "chartreuse"},
        {"height_in": "tall"},
        {"height_in": 0},
        {"bloom_months": [13]},
        {"bloom_months": "June"},
    ])
    def test_a_given_value_must_be_real(self, bad):
        with pytest.raises(ValueError):
            c.validate_look({"crop": "zinnia", **bad})

    def test_look_of_reads_what_was_written(self):
        look = c.look_of({"flower_color": "pink", "height_in": 24, "bloom_months": [7, 8, "x"]})
        assert look == Look("pink", 24.0, (7, 8))
