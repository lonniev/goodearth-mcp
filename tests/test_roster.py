"""Roster review — grounded in the record, and never in what a model recalls."""

from __future__ import annotations

from datetime import date

from goodearth_mcp import roster

TODAY = date(2026, 9, 1)

PEST_CAT = {
    "search_span_km": 16.0,
    "events": [
        {"name": "Japanese beetle adult", "date": "2026-07-10", "source": "USA-NPN Pheno Forecast"},
        {"name": "Emerald ash borer adult", "date": "2026-06-14", "source": "USA-NPN Pheno Forecast"},
    ],
    "insects_recorded": [
        {"name": "Common Eastern Bumble Bee", "observations": 626},
        {"name": "Asian Lady Beetle", "observations": 569},
        {"name": "Rare Thing", "observations": 3},
    ],
}
WILD_CAT = {
    "search_span_km": 16.0,
    "groups": [{"group": "Mammals", "species": [
        {"name": "Coyote", "observations": 245},
        {"name": "Barred Owl", "observations": 387},
    ]}],
}
FROST = {"last_spring_median": "2026-04-20", "first_fall_median": "2026-11-05"}


def run(**kw):
    base = {
        "region_label": "Frogdale", "pests": [], "wildlife": [], "observations": [],
        "pest_catalog": PEST_CAT, "wildlife_catalog": WILD_CAT,
        "frost": FROST, "today": TODAY,
    }
    base.update(kw)
    return roster.review(**base)


# ── Listed, and the record does not know it ──────────────────────────────


def test_a_species_the_record_does_not_know_is_flagged():
    out = run(wildlife=[{"species": "Polar bear"}])
    assert [f["name"] for f in out["out_of_range"]] == ["Polar bear"]


def test_the_reason_is_about_the_record_not_the_animal():
    """Good Earth does not publish natural history.

    "Not recorded within 16 km" is a fact this service can stand behind.
    "Does not live here" is a claim about the world, and the grower who
    genuinely saw the odd thing is exactly the case worth keeping.
    """
    f = run(wildlife=[{"species": "Polar bear"}])["out_of_range"][0]
    assert "not recorded" in f["reason"].lower()
    for forbidden in ("does not live", "cannot live", "impossible", "not native"):
        assert forbidden not in f["reason"].lower()
    assert "not proof it is absent" in f["verdict"]


def test_a_listed_pest_the_record_knows_is_not_flagged():
    assert run(pests=[{"pest": "Japanese beetle"}])["out_of_range"] == []


def test_stage_words_do_not_make_a_roster_entry_look_unknown():
    """A grower's "codling moth first flight" and a catalogue's "codling moth"
    are the same animal; matching on the raw string would flag every entry."""
    out = run(pests=[{"pest": "Japanese beetle first flight"}])
    assert out["out_of_range"] == []


# ── The record knows it, the roster does not ─────────────────────────────


def test_a_modelled_pest_missing_from_the_roster_is_named():
    names = [a["name"] for a in run()["absent"]]
    assert "Japanese beetle adult" in names


def test_a_thinly_recorded_species_is_not_proposed():
    """Three sightings is one person noticing once.

    That is evidence a species CAN be here, not that a grower should watch
    for it — proposing it would bury the two findings that matter.
    """
    assert "Rare Thing" not in [a["name"] for a in run()["absent"]]


def test_a_well_recorded_species_is_proposed_with_its_count():
    hit = next(a for a in run()["absent"] if a["name"] == "Barred Owl")
    assert hit["evidence"]["observations"] == 387
    assert "387" in hit["reason"]


def test_nothing_already_tracked_is_proposed_again():
    out = run(pests=[{"pest": "Japanese beetle"}], wildlife=[{"species": "Coyote"}])
    names = [a["name"] for a in out["absent"]]
    assert "Coyote" not in names
    assert not any("Japanese beetle" in n for n in names)


# ── Observations that cannot be right ────────────────────────────────────
#
# The case that does damage: these feed calibration, which moves the heat and
# frost bias for the WHOLE block, so one junk row degrades every later answer.


def test_a_frost_inside_this_grounds_own_frost_free_window_is_flagged():
    out = run(observations=[{"kind": "frost", "observed_on": "2026-07-04"}])
    assert len(out["implausible"]) == 1
    r = out["implausible"][0]["reason"]
    assert "2026-04-20" in r and "2026-11-05" in r


def test_the_frost_window_is_this_grounds_not_an_assumed_season():
    """A July frost is absurd in Vermont and unremarkable at altitude.

    The check is against the region's OWN median dates, so it cannot be
    exported to ground it was never measured on.
    """
    arctic = {"last_spring_median": "2026-06-25", "first_fall_median": "2026-08-05"}
    out = run(observations=[{"kind": "frost", "observed_on": "2026-05-20"}], frost=arctic)
    assert out["implausible"] == []


def test_a_frost_outside_the_window_is_left_alone():
    # Early April, before this ground's median last spring frost — ordinary,
    # and in the past, so neither rule should touch it. (An autumn date would
    # have tested the future-date rule instead: 20 November is still ahead of
    # a 1 September "today".)
    assert run(observations=[{"kind": "frost", "observed_on": "2026-04-01"}])["implausible"] == []


def test_a_future_date_is_flagged():
    out = run(observations=[{"kind": "note", "observed_on": "2027-01-01"}])
    assert "future" in out["implausible"][0]["reason"]


def test_an_unknown_species_in_an_observation_is_questioned_not_deleted():
    out = run(observations=[{"kind": "pest", "species": "Walrus", "observed_on": "2026-06-03"}])
    assert len(out["implausible"]) == 1
    assert "confirming the name" in out["implausible"][0]["reason"]


def test_missing_frost_data_does_not_invent_a_verdict():
    """With no frost record, a July frost cannot be judged — so it is not."""
    assert run(observations=[{"kind": "frost", "observed_on": "2026-07-04"}], frost=None)["implausible"] == []


def test_the_answer_says_it_is_proposed_rather_than_applied():
    assert "not applied" in run()["note"].lower()
