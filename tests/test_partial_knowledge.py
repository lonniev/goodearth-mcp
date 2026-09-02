"""Partial knowledge is the permanent condition of farming.

A grower knows some of what is on their ground, some of the time. Every test
here is a true statement the record refused to hold until now, and each one
came from a real season interview that could not be persisted honestly.
"""

from __future__ import annotations

import pytest

from goodearth_mcp import calendar_feed, crops, pests

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
