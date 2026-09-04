"""Every per-call limit, held against what the front end actually sends.

These limits were each sized against the catalogue or the roster as it stood
at the time, and every one of them became a tripwire under a later list. The
Trees chiclet shipped refusing its own library — "89 trees is more than one
call should carry (limit 40)" — and two more sat a single preset away from the
same failure while a fourth broke as soon as a grower watched an eleventh pest.

So the numbers are asserted here against the real `plantings.ts`, parsed rather
than restated: a test that repeats the count would pass on the day someone
adds the preset that breaks production.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from goodearth_mcp import crop_status, perennial, pest_window, planting, suitability

PRESETS = Path(__file__).resolve().parents[1] / "frontend/src/lib/plantings.ts"


def _presets() -> list[dict[str, bool]]:
    """Every entry in CROP_PRESETS, as the two flags the split turns on.

    Parsed from the source rather than executed: this suite has no node, and
    the shape being counted is a literal list.
    """
    src = PRESETS.read_text()
    body = src[src.index("export const CROP_PRESETS"):src.index("export const HEAT_RATED")]
    rows = []
    for entry in re.findall(r"\{\s*crop:.*?\n(?:.*?\n)*?.*?\},", body):
        rows.append({
            "heat": "gddTarget:" in entry and "baseTempF:" in entry,
            "winter": "perennial: true" in entry,
        })
    return rows


@pytest.fixture(scope="module")
def counts() -> dict[str, int]:
    rows = _presets()
    assert len(rows) > 100, f"only parsed {len(rows)} presets — the parser has drifted"
    return {
        "heat": sum(1 for r in rows if r["heat"]),
        "winter": sum(1 for r in rows if r["winter"]),
        "total": len(rows),
    }


def test_the_parser_actually_sees_both_kinds(counts):
    """A guard on the guard. A parser that silently matched nothing would make
    every assertion below vacuously true."""
    assert counts["heat"] > 40
    assert counts["winter"] > 40
    assert counts["heat"] + counts["winter"] >= counts["total"]


def test_tree_suitability_can_carry_the_whole_perennial_library(counts):
    """THE ONE THAT SHIPPED BROKEN. The Trees chiclet rates every perennial in
    one call, so the limit has to clear the library with room to grow."""
    assert perennial.MAX_TREES >= counts["winter"], (
        f"{counts['winter']} perennials ship and the limit is {perennial.MAX_TREES}"
    )


def test_crop_suitability_can_carry_the_whole_heat_rated_library(counts):
    assert suitability.MAX_CROPS >= counts["heat"]


def test_planting_window_can_carry_the_whole_heat_rated_library(counts):
    assert planting.MAX_CROPS >= counts["heat"]


def test_every_limit_leaves_room_for_the_library_to_grow(counts):
    """A limit that exactly fits today is the same tripwire one preset later."""
    for name, limit, need in (
        ("MAX_TREES", perennial.MAX_TREES, counts["winter"]),
        ("suitability.MAX_CROPS", suitability.MAX_CROPS, counts["heat"]),
        ("planting.MAX_CROPS", planting.MAX_CROPS, counts["heat"]),
    ):
        assert limit >= need * 2, f"{name}={limit} has no headroom over {need}"


def test_a_roster_limit_is_not_a_catalogue_limit():
    """These bound what a GROWER saved, not what this repo ships, so no parse
    can check them — only a floor a real farm will not reach. Ten pests was
    below that floor and a grower watching eleven lost the whole page.
    """
    assert pest_window.MAX_MODELS >= 40
    assert crop_status.MAX_PLANTINGS >= 40


def test_the_limits_still_refuse_something():
    """They are a guard against a hostile caller, not an absence of one."""
    for limit in (perennial.MAX_TREES, suitability.MAX_CROPS,
                  planting.MAX_CROPS, pest_window.MAX_MODELS):
        assert limit < 1_000
