"""Suitability — margin, not a yes/no, and the units that make it true."""

from __future__ import annotations

import pytest

from goodearth_mcp import suitability as s


def crop(**kw):
    base = {"crop": "Field corn", "gdd_target": 2600, "base_temp": 50}
    base.update(kw)
    return base


def test_a_crop_validates():
    c = s.validate_crop(crop())
    assert c["gdd_target"] == 2600.0 and c["base_temp_f"] == 50.0


@pytest.mark.parametrize("bad", [None, "corn", 7, [], {}])
def test_non_object_crops_are_rejected(bad):
    with pytest.raises(s.SuitabilityError):
        s.validate_crop(bad)


@pytest.mark.parametrize("g", [0, -100, 99_999, "lots", None])
def test_impossible_targets_are_rejected(g):
    with pytest.raises(s.SuitabilityError):
        s.validate_crop(crop(gdd_target=g))


def test_a_celsius_base_is_rejected():
    with pytest.raises(s.SuitabilityError):
        s.validate_crop(crop(base_temp=10))


# ── Verdicts ─────────────────────────────────────────────────────────────


def test_plenty_of_slack_is_comfortable():
    assert s.verdict(3000, 2000) == "comfortable"


def test_a_little_slack_is_tight():
    assert s.verdict(2100, 2000) == "tight"


def test_exactly_enough_is_marginal_not_a_pass():
    """A crop that finishes on the last warm day of an average year fails in
    half of them."""
    assert s.verdict(2000, 2000) == "marginal"


def test_not_enough_is_too_short():
    assert s.verdict(1500, 2000) == "too_short"


# ── Margin in days ───────────────────────────────────────────────────────


def test_margin_is_reported_in_the_days_a_grower_plans_in():
    got = s.assess(s.validate_crop(crop(gdd_target=2000)), {50.0: 2800}, 190)
    assert got["verdict"] == "comfortable"
    assert got["surplus_days"] and got["surplus_days"] > 0


def test_margin_uses_the_crops_OWN_base_temperature():
    """Dividing a base-40 surplus by a base-50 rate reported 193 days of margin
    inside a 190-day window — impossible, and plausible-looking, because a low
    base ought to give a bigger margin."""
    got = s.assess(
        s.validate_crop(crop(crop="Oats", gdd_target=1700, base_temp=40)),
        {40.0: 4555.3, 50.0: 2808.9}, 190,
    )
    assert got["surplus_days"] is not None
    assert abs(got["surplus_days"]) <= 190


def test_a_shortfall_is_reported_as_negative_days():
    got = s.assess(s.validate_crop(crop(crop="Watermelon", gdd_target=3200, base_temp=50)),
                   {50.0: 2800}, 190)
    assert got["verdict"] == "too_short"
    assert got["surplus_days"] < 0


def test_a_crop_at_an_unmeasured_base_is_unknown_not_guessed():
    got = s.assess(s.validate_crop(crop(base_temp=62)), {50.0: 2800}, 190)
    assert got["verdict"] == "unknown"


def test_frost_hardiness_changes_the_advice_not_the_arithmetic():
    hardy = s.assess(s.validate_crop(crop(gdd_target=3200, frost_hardy=True)), {50.0: 2800}, 190)
    tender = s.assess(s.validate_crop(crop(gdd_target=3200)), {50.0: 2800}, 190)
    assert hardy["surplus_gdd"] == tender["surplus_gdd"]
    assert "shoulders" in hardy["note"] and "shoulders" not in tender["note"]


def test_rows_sort_the_workable_crops_first():
    rows = [
        {"verdict": "too_short", "surplus_gdd": -400},
        {"verdict": "comfortable", "surplus_gdd": 800},
        {"verdict": "tight", "surplus_gdd": 100},
    ]
    rows.sort(key=s.sort_key)
    assert [r["verdict"] for r in rows] == ["comfortable", "tight", "too_short"]
