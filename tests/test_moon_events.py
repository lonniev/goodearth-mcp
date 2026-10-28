"""Events timed by the moon: the nth new, quarter or full moon after a day.

The almanac uses the mean synodic month, so a computed phase can sit up to a
day from the true instant; published 2026 dates are checked to within a day.
"""

from __future__ import annotations

from datetime import date, timedelta
from itertools import pairwise

import pytest

from goodearth_mcp import almanac, wildlife

#: Published 2026 full and new moons (UTC dates).
FULL_2026 = ["2026-01-03", "2026-03-03", "2026-05-01", "2026-05-31", "2026-07-29",
             "2026-09-26", "2026-11-24"]
NEW_2026 = ["2026-01-18", "2026-03-19", "2026-05-16", "2026-07-14", "2026-09-11",
            "2026-11-09"]


def near(got: date | None, want: str) -> bool:
    return got is not None and abs((got - date.fromisoformat(want)).days) <= 1


@pytest.mark.parametrize("want", FULL_2026)
def test_the_full_moon_falls_within_a_day_of_the_published_one(want):
    got = almanac.next_phase(date.fromisoformat(want) - timedelta(days=5), "full")
    assert near(got, want), got


@pytest.mark.parametrize("want", NEW_2026)
def test_the_new_moon_falls_within_a_day_of_the_published_one(want):
    got = almanac.next_phase(date.fromisoformat(want) - timedelta(days=5), "new")
    assert near(got, want), got


def test_no_phase_is_ever_skipped_through_a_year():
    """Matching on a phase NAME could skip a full moon whose window fell
    between two noons. The crossing never does: twelve or thirteen a year."""
    d, seen = date(2026, 1, 1), []
    while True:
        f = almanac.next_phase(d, "full")
        if f is None or f.year > 2026:
            break
        seen.append(f)
        d = f + timedelta(days=1)
    assert len(seen) in (12, 13)
    gaps = [(b - a).days for a, b in pairwise(seen)]
    assert all(28 <= g <= 31 for g in gaps), gaps


def test_quarters_sit_between_new_and_full():
    new = almanac.next_phase(date(2026, 5, 10), "new")
    first = almanac.next_phase(new, "first_quarter")
    full = almanac.next_phase(new, "full")
    last = almanac.next_phase(full, "last_quarter")
    assert new < first < full < last


def test_next_full_moon_keeps_its_answer_shape():
    assert near(date.fromisoformat(almanac.next_full_moon(date(2026, 4, 25))), "2026-05-01")


def test_an_unknown_phase_is_refused():
    with pytest.raises(ValueError):
        almanac.next_phase(date(2026, 1, 1), "gibbous")


# ── The moon driver ──────────────────────────────────────────────────────


def moon(**kw):
    return wildlife.validate_event({"species": "Toad", "event": "chorus", "driver": "moon", **kw})


def test_a_moon_event_reads_with_its_defaults():
    ev = moon(phase="full")
    assert (ev["phase"], ev["after"], ev["nth"]) == ("full", "01-01", 1)


@pytest.mark.parametrize("kw", [{}, {"phase": "waxing"}, {"phase": "full", "after": "13-40"},
                                {"phase": "full", "nth": 4}, {"phase": "full", "nth": "x"}])
def test_a_moon_event_without_a_real_phase_or_anchor_is_refused(kw):
    with pytest.raises(wildlife.WildlifeError):
        moon(**kw)


def test_the_first_full_moon_after_a_day():
    ev = moon(phase="full", after="05-02")
    assert near(wildlife.moon_date(ev, 2026), "2026-05-31")


def test_the_second_new_moon_after_a_day():
    ev = moon(phase="new", after="03-01", nth=2)
    assert near(wildlife.moon_date(ev, 2026), "2026-04-17")


def test_a_moon_event_is_dated_this_year_and_says_what_it_is():
    ev = moon(phase="full", after="05-02")
    before = wildlife.moon_event(ev, date(2026, 5, 10))
    after = wildlife.moon_event(ev, date(2026, 6, 15))
    assert before["projected_date"] and not before["reached_on"]
    assert after["reached_on"] and not after["projected_date"]
    assert before["threshold"] == "first full moon after May 2"


def test_a_leap_day_anchor_works_in_a_common_year():
    ev = moon(phase="full", after="02-29")
    assert wildlife.moon_date(ev, 2026) is not None
