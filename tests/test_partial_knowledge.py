"""Partial knowledge is the permanent condition of farming.

A grower knows some of what is on their ground, some of the time. Every test
here is a true statement the record refused to hold until now, and each one
came from a real season interview that could not be persisted honestly.
"""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import calendar_feed, crop_status, crops, pests

# ── A watch list is not a model ──────────────────────────────────────────


def test_a_watched_creature_needs_no_degree_days():
    """Voles, slugs and wasps are watched all season and have no stages.

    Demanding thresholds for them invites exactly the confidently-wrong numbers
    that review_roster warns about — an agent would have to supply figures it
    can only get from training data.
    """
    row = pests.validate_model({"pest": "Vole", "watch": True})
    assert row["pest"] == "Vole"
    assert row["stages"] == []
    assert row["watch"] is True


def test_a_pest_with_neither_stages_nor_watch_is_still_refused():
    """The gap must be declared. Silence is not a watch list."""
    with pytest.raises(pests.PestError) as exc:
        pests.validate_model({"pest": "Japanese beetle"})
    assert "watch=true" in str(exc.value)


def test_watch_does_not_silence_a_real_model():
    """A model WITH stages is validated as one, flag or no flag."""
    with pytest.raises(pests.PestError):
        pests.validate_model({
            "pest": "Codling moth", "watch": True,
            "stages": [{"stage": "first flight"}],  # no gdd
        })


# ── A planting without a date is still a planting ────────────────────────


def test_a_crop_can_be_on_the_record_without_a_set_out_date():
    row = crops.validate_planting({"crop": "Potato", "gdd_target": 1800})
    assert row["set_out"] is None
    assert row["presence_only"] is True


def test_a_malformed_date_is_still_a_refusal():
    """A gap and a typo are different things, and only one is honest."""
    with pytest.raises(crops.CropError):
        crops.validate_planting({"crop": "Potato", "gdd_target": 1800, "set_out": "last May"})


# ── One bad row must not cost the grower the other forty ─────────────────


def test_one_unrenderable_row_does_not_take_the_whole_feed():
    """The regression this fixes.

    While the caller passed these collections in, it could simply omit a row it
    could not date. Once the feed began reading them from the block's record
    there was no way around it — a single stored row that would not validate
    made the feed permanently unpublishable.
    """
    good = {"pest": "Codling moth", "stages": [{"stage": "first flight", "gdd": 250}]}
    bad = {"pest": "Japanese beetle"}  # no stages, no watch flag
    kept, skipped = calendar_feed._each([good, bad], pests.validate_model, "pest")
    assert [k["pest"] for k in kept] == ["Codling moth"]
    assert len(skipped) == 1


def test_what_was_skipped_is_named_and_explained():
    """A feed that silently shrank would be worse than one that refused."""
    _, skipped = calendar_feed._each(
        [{"crop": "Dahlia", "gdd_target": 1200, "set_out": "not a date"}],
        crops.validate_planting, "planting",
    )
    assert skipped[0]["name"] == "Dahlia"
    assert skipped[0]["kind"] == "planting"
    assert "YYYY-MM-DD" in skipped[0]["reason"]


def test_a_row_that_validates_is_never_reported_as_skipped():
    kept, skipped = calendar_feed._each(
        [{"crop": "Garlic", "gdd_target": 1900, "set_out": "2026-10-15"}],
        crops.validate_planting, "planting",
    )
    assert len(kept) == 1 and skipped == []


# ── One unusable row must not cost the ledger, either ─────────────────────


def test_a_row_with_no_heat_target_does_not_blank_the_ledger():
    """The live failure: one columbine hid an entire farm.

    A perennial recorded as "grows here" has no degree-day target. The old
    contract required one, the frontend supplied 0 to satisfy it, and 0 fails
    the range check — so `crop_gdd_status` raised and the grower's whole crop
    ledger rendered as "No plantings yet". Three separate mistakes stacked:
    a mandatory field that should not have been, a fabricated value to fill
    it, and a validation loop that failed whole rather than per row.
    """
    rows = [
        {"crop": "Dahlia", "gdd_target": 1200, "set_out": "2026-05-24"},
        {"crop": "Columbine"},                       # presence: neither half
        {"crop": "Peony", "set_out": "2026-04-10"},  # dated, but no target
    ]
    parsed = [crops.validate_planting(r) for r in rows]   # none of these raise
    assert parsed[0]["gdd_target"] == 1200
    assert parsed[1]["presence_only"] is True
    assert parsed[2]["presence_only"] is True


async def test_a_roster_that_needs_no_weather_still_answers():
    """A wildlife list of only calendar and interval events is ORDINARY.

    "Swallows arrive about 20 April" and a gestation count need no season
    curve, so the weather fetch is skipped — and the provenance block at the
    end then read a variable that had never been bound. The grower lost every
    creature they track because none of them happened to need heat. Not a bad
    row taking the page down; a perfectly good list doing it.
    """
    from goodearth_mcp import block_store, record_cache, wildlife_window
    from goodearth_mcp.region import parse_region

    class Offline:
        def _t(self, t): return t
        async def _execute(self, sql, params=None): return {}

    record_cache._vault, record_cache._schema_done = Offline(), True
    record_cache.serving("")
    try:
        out = await wildlife_window.region_wildlife(
            parse_region(block_store.EXAMPLE_BLOCK["geometry"]),
            [
                {"species": "Hirundo rustica", "event": "migration arrival",
                 "driver": "calendar", "typical_on": "2026-04-20"},
                {"species": "Ovis aries", "event": "lambing", "driver": "interval",
                 "days": 147, "from": "2026-01-05"},
            ],
            today=date(2026, 9, 3),
        )
    finally:
        record_cache._vault, record_cache._schema_done = None, False

    assert out["success"] is True
    assert len(out["events"]) == 2
    assert out["sources"], "provenance still answers, naming no feed it did not use"


def test_a_presence_row_names_which_half_it_is_missing():
    """The reason must be true of THIS row, not of presence rows in general.

    ``validate_planting`` nulls the set-out whenever either field is absent,
    so a caller deriving the reason from ``set_out is None`` told a grower who
    HAD given a date that there was "no set-out recorded" — and its branch for
    a missing target could never run at all. A guard that cannot fire for the
    real reason is worse than no guard: it is a confident wrong answer.
    """
    neither = crops.validate_planting({"crop": "Honeycrisp apple"})
    dated = crops.validate_planting({"crop": "Peony", "set_out": "2026-04-10"})
    targeted = crops.validate_planting({"crop": "Meyer lemon", "gdd_target": 2000})

    assert neither["missing"] == ["set_out", "gdd_target"]
    assert dated["missing"] == ["gdd_target"], "the date WAS given"
    assert targeted["missing"] == ["set_out"]


def test_the_ledger_reports_a_perennial_rather_than_dropping_it():
    """An orchard tree is on the record. The ledger must say so.

    The rows the ledger can evaluate and the rows it cannot are both part of
    the grower's record. Returning only the first made an apple tree invisible
    on the very page meant to list what grows here, which reads as data loss
    when nothing was lost.
    """
    why = crop_status._why_untracked(
        crops.validate_planting({"crop": "Bartlett pear", "set_out": "2024-04-15"})
    )
    assert why == "no heat target recorded"
    assert "set-out" not in why, "it has a set-out; saying otherwise is a lie"

    both = crop_status._why_untracked(crops.validate_planting({"crop": "Apple"}))
    assert "set-out" in both and "heat target" in both


def test_a_reason_survives_a_row_that_names_nothing():
    """Never raise while explaining. A missing explanation is not an error."""
    assert crop_status._why_untracked({"crop": "X"})
    assert crop_status._why_untracked({"crop": "X", "missing": []})
    assert crop_status._why_untracked({"crop": "X", "missing": ["unheard_of"]})


def test_a_stated_zero_is_still_refused():
    """Absent is a gap; zero is a claim, and a wrong one."""
    with pytest.raises(crops.CropError):
        crops.validate_planting({"crop": "X", "gdd_target": 0, "set_out": "2026-05-01"})


# ── The same shape, in every collection ──────────────────────────────────


def test_every_collection_lets_a_grower_record_without_dating():
    """One rule, three collections: naming a thing is not scheduling it.

    Each of these was mandatory once, and each refusal cost a whole page —
    a crop ledger, a pest list, a wildlife year — because the rows were
    validated as a batch. A grower records what is on their ground long
    before they can date it.
    """
    from goodearth_mcp import wildlife

    assert crops.validate_planting({"crop": "Columbine"})["presence_only"] is True
    assert pests.validate_model({"pest": "Vole", "watch": True})["watch"] is True
    assert wildlife.validate_event({"species": "Great blue heron"})["roster_only"] is True


def test_no_validator_is_called_in_a_list_comprehension():
    """The fix does not generalise by being written down once.

    calendar_feed was fixed, then crop_status was found with the same bug, then
    both windows. A comprehension over a validator means one unusable row takes
    every good row with it.
    """
    import pathlib
    import re

    src_dir = pathlib.Path(__file__).parent.parent / "src" / "goodearth_mcp"
    offenders = []
    for path in src_dir.glob("*.py"):
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if re.search(r"\[\s*\w*\.?validate_\w+\(.*for .* in ", line):
                offenders.append(f"{path.name}:{n}")
    assert not offenders, (
        "validator called inside a comprehension at " + ", ".join(offenders)
        + " — one bad row will take the whole collection with it"
    )


# ── Referencing a published model, rather than restating it ───────────────


def test_a_pest_may_reference_a_published_model():
    """"Watch the Japanese beetle by the published forecast" needs no numbers.

    The service already reads USA-NPN's layers for the caller's own ground —
    pest_catalog renders their dates on screen. Asking the caller to restate
    those as degree-day stages invites exactly the confidently-wrong figures
    review_roster warns about, because an agent can only get them from training
    data.
    """
    row = pests.validate_model({"pest": "Japanese beetle", "model": "usa-npn"})
    assert row["model"] == "usa-npn"
    assert row["stages"] == []


def test_an_unknown_model_name_is_refused_with_the_alternatives():
    """A name we cannot resolve is a promise we cannot keep."""
    with pytest.raises(pests.PestError) as exc:
        pests.validate_model({"pest": "Japanese beetle", "model": "vibes"})
    assert "usa-npn" in str(exc.value)
    assert "watch=true" in str(exc.value)


def test_explicit_stages_still_win_over_a_reference():
    """A grower with extension-service numbers keeps using them."""
    row = pests.validate_model({
        "pest": "Codling moth", "model": "usa-npn",
        "stages": [{"stage": "first flight", "gdd": 250}],
    })
    assert len(row["stages"]) == 1
    assert row.get("model") in (None, "")


def test_the_three_shapes_are_all_accepted():
    """The change request's whole ask, in one assertion.

    A roster legitimately holds all three at once: creatures with no model at
    all, insects whose model somebody else publishes, and the one pest this
    grower has a local bulletin for.
    """
    rows = [
        pests.validate_model({"pest": "Vole", "watch": True}),
        pests.validate_model({"pest": "Spotted lanternfly", "model": "usa-npn"}),
        pests.validate_model({"pest": "Codling moth",
                              "stages": [{"stage": "egg hatch", "gdd": 220}]}),
    ]
    assert [bool(r.get("watch")) for r in rows] == [True, False, False]
    assert [r.get("model") for r in rows] == [None, "usa-npn", None]
    assert [len(r["stages"]) for r in rows] == [0, 0, 1]


@pytest.mark.asyncio
async def test_a_referenced_model_resolves_to_dates_for_this_ground(monkeypatch):
    """The reference becomes dates, and says where they came from."""
    from goodearth_mcp import catalog

    async def fake_catalog(region, today=None):
        return {"events": [
            # NPN's own layer naming — longer than what a grower types.
            {"model": "japanese_beetle_adult", "name": "Japanese beetle adult",
             "date": "2026-06-18", "passed": False,
             "source": "USA-NPN Pheno Forecast", "resolution_m": 2400},
            {"model": "lilac_bloom", "name": "Lilac bloom", "date": "2026-05-02",
             "passed": True, "source": "USA-NPN Pheno Forecast", "resolution_m": 2400},
        ]}

    monkeypatch.setattr(catalog, "region_pest_catalog", fake_catalog)
    events, unresolved = await catalog.resolve_referenced_models(
        object(), [{"pest": "Japanese beetle", "model": "usa-npn", "stages": []}],
    )
    assert unresolved == []
    assert len(events) == 1
    assert events[0]["date"] == "2026-06-18"
    assert events[0]["pest"] == "Japanese beetle"
    # The citation travels with it. This is a source being quoted, not an
    # assertion Good Earth is making about insects.
    assert events[0]["source"] == "USA-NPN Pheno Forecast"


@pytest.mark.asyncio
async def test_a_model_with_nothing_published_here_is_named_not_dropped(monkeypatch):
    """"NPN publishes nothing for this here" is an answer."""
    from goodearth_mcp import catalog

    async def empty(region, today=None):
        return {"events": []}

    monkeypatch.setattr(catalog, "region_pest_catalog", empty)
    events, unresolved = await catalog.resolve_referenced_models(
        object(), [{"pest": "Emerald ash borer", "model": "usa-npn", "stages": []}],
    )
    assert events == []
    assert len(unresolved) == 1
    assert unresolved[0]["pest"] == "Emerald ash borer"


# ── A tree is not a planting with fields missing ─────────────────────────


def test_a_perennial_says_what_it_IS_not_what_it_lacks():
    """"No set-out recorded" reads as a gap to go and fill. For an apple tree
    there is nothing to fill — it is a different kind of thing, rated on
    whether it survives the winter here rather than on heat."""
    from goodearth_mcp import crop_status, crops

    p = crops.validate_planting({"crop": "Apple", "perennial": True})
    assert p["perennial"] is True
    assert crop_status._why_untracked(p) == "perennial — rated on winter, not on heat"


def test_a_tree_is_recognised_from_what_it_CARRIES_not_only_from_a_flag():
    """An agent that saved a tree through the MCP knowing only its chill
    figure never set a flag, and the row is still a tree."""
    from goodearth_mcp import crops

    assert crops.validate_planting({"crop": "Pear", "chill_hours": 700})["perennial"]
    assert crops.validate_planting({"crop": "Maple", "hardy_to_f": -40})["perennial"]


def test_an_annual_someone_half_entered_still_says_which_field_is_missing():
    """The distinction is load-bearing in both directions: a zinnia with no
    set-out IS a gap, and calling it a perennial would hide it."""
    from goodearth_mcp import crop_status, crops

    p = crops.validate_planting({"crop": "Zinnia", "gdd_target": 1100})
    assert "perennial" not in p
    assert crop_status._why_untracked(p) == "no set-out recorded"
