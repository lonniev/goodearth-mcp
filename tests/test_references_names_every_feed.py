"""What the References page must keep true about the service behind it.

That page exists so a grower can audit an answer — "not trust us, here is the
feed, here is what it resolves, here is the model on top". It is hand-written,
so it drifts, and it had: the disease layer added an hourly request and the
page said nothing, while the entry describing "the running season" named the
FALLBACK feed at 9 km when the service asks a 2 km one first.

A NOTE ON WHAT IS NOT CHECKED HERE. The first version of this file asserted
that every API host in `sources.py` appeared in the page's links. Every one
failed — because the page links DOCUMENTATION, which is the right thing for a
human reader, and `archive-api.open-meteo.com` appears nowhere in it. The probe
was wrong, not the page. What follows asserts only things the page actually
promises, which is the difference between a guard and a nuisance.
"""

from __future__ import annotations

from pathlib import Path

from goodearth_mcp import disease, sources

REFERENCES = Path(__file__).resolve().parents[1] / "frontend" / "src" / "views" / "References.tsx"


def page() -> str:
    return REFERENCES.read_text(encoding="utf-8")


def test_both_history_feeds_are_named_and_told_apart() -> None:
    """The pair whose disagreement can change a disease verdict.

    30 wet hours against 86 over one fortnight at Panton. A page that named
    only one of them would let a reader take the number on the screen for the
    only number there was.
    """
    text = page()
    for doc in ("historical-forecast-api", "historical-weather-api"):
        assert doc in text, f"no entry links {doc}; a reader cannot look that feed up"


def test_the_running_season_is_attributed_to_the_feed_asked_FIRST() -> None:
    """The bug this file was written for.

    `_history_any_feed` tries `_HISTORY` before `_ARCHIVE_ERA5`, so the page
    must not put the reanalysis where a reader meets it first and takes it for
    the primary. It did, for months.
    """
    assert sources._HISTORY_FEEDS[0][0] == sources._HISTORY, (
        "the feed order changed in sources.py — References.tsx says otherwise"
    )
    text = page()
    primary_at = text.find("historical-forecast-api")
    era5_at = text.find("historical-weather-api")
    assert primary_at < era5_at, (
        "the reanalysis is listed above the archived model runs, so a reader "
        "meets the fallback first and takes it for the primary"
    )


def test_every_disease_model_the_service_runs_is_explained() -> None:
    """A model that names a verdict with no entry is a verdict nobody can check."""
    text = page().lower()
    missing = [
        key for key, spec in disease.MODELS.items()
        if spec["name"].lower() not in text and key.replace("_", " ") not in text
    ]
    assert not missing, f"models with no entry under Models: {missing}"


def test_the_wetness_estimator_is_stated_with_its_own_thresholds() -> None:
    """The one claim this layer must never let a reader miss.

    Not merely the word "estimated": the numbers, so a grower can tell whether
    an hour on their farm would have counted.
    """
    text = page().lower()
    assert "leaf wetness" in text
    assert "estimated" in text and "never measured" in text
    assert "90%" in text, "the humidity threshold is not stated"
    for variable in ("humidity", "dew point", "rain"):
        assert variable in text, f"the estimator reads {variable} and the page does not say so"


def test_newa_is_named_as_the_reference_rather_than_as_a_feed() -> None:
    """It is where these models come from, and it is NOT called.

    Saying so matters both ways: a reader deserves the citation, and they
    deserve to know this service does not depend on that host being up.
    """
    text = page()
    assert "NEWA" in text
    assert "newa.cornell.edu" in text
