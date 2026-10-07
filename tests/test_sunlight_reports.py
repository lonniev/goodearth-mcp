"""Field reports move a spot's horizon — only where three agree, and only as far as the sun was."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pytest

from goodearth_mcp import calibration as cal
from goodearth_mcp import horizon as hz
from goodearth_mcp import sunlight_reports as sr
from goodearth_mcp.region import ring_of

GEO = {"type": "Polygon", "coordinates": [[
    [-72.0, 44.0], [-71.9995, 44.0], [-71.9995, 44.0004], [-72.0, 44.0004], [-72.0, 44.0],
]]}
EDT = timedelta(hours=-4)
SPOT = (44.0002, -71.99975)  # the block's middle
SOUTH = [b for b in range(hz.AZ_BINS) if 150 <= b * hz.AZ_STEP_DEG <= 210]


def _grid() -> hz.Grid:
    return hz.build_grid(ring_of(GEO))


def _horizon(grid: hz.Grid, canopy_deg: float = 0.0, bins=None) -> hz.Horizon:
    canopy = np.zeros((grid.n, hz.AZ_BINS), np.uint16)
    if bins is not None:
        canopy[:, bins] = int(canopy_deg * 10)
    return hz.Horizon(terrain=np.zeros_like(canopy), canopy=canopy, kind=np.zeros_like(canopy, dtype=np.uint8))


def _report(light: str, day="2026-06-14", start="11:00", end="13:00", spot=SPOT, **extra) -> dict:
    lat, lon = spot
    return cal.validate_observation({
        "kind": "sunlight", "observed_on": day, "from": start, "to": end, "light": light,
        "lat": lat, "lon": lon,
    } | extra)


# ── the shape of a report ────────────────────────────────────────────────────

def test_a_sunlight_report_parses_its_clock_and_spot():
    r = _report("sun", start="9:00", end="14:30")
    assert r["kind"] == "sunlight" and r["light"] == "sun"
    assert (r["from"], r["to"]) == (540, 870)
    assert r["observed_on"] == date(2026, 6, 14)


@pytest.mark.parametrize("bad", [
    {"light": "bright"}, {"light": None}, {"lat": None}, {"lon": "east"}, {"lat": 91.0},
    {"from": "25:00"}, {"to": "9"}, {"from": "noon"}, {"from": "14:00", "to": "09:00"},
])
def test_a_malformed_sunlight_report_is_refused_with_the_shape_named(bad):
    base = {"kind": "sunlight", "observed_on": "2026-06-14", "from": "11:00", "to": "13:00",
            "light": "sun", "lat": SPOT[0], "lon": SPOT[1]}
    with pytest.raises(cal.CalibrationError):
        cal.validate_observation(base | bad)


# ── one report → bounds ──────────────────────────────────────────────────────

def test_a_midday_june_sun_report_bounds_the_southern_bins_below_the_sun():
    grid = _grid()
    found = sr.sun_bounds(_report("sun"), grid, EDT)
    assert not isinstance(found, str)
    bins = {b.az_bin for b in found}
    # 11:00–13:00 EDT at 72° W is solar 10:12–12:12; a high June sun swings
    # fast through the south-east to just past south in those two hours.
    assert bins and all(120 <= b * hz.AZ_STEP_DEG <= 190 for b in bins)
    assert min(bins) * hz.AZ_STEP_DEG < 150 < max(bins) * hz.AZ_STEP_DEG
    # June noon at 44° N is about 69° up; every bound is a real sun height.
    assert all(55.0 <= b.elevation_deg <= 70.0 for b in found)
    # A phone's fix reaches the neighbouring cells, not just one.
    assert len({b.cell for b in found}) > 1


def test_a_report_at_night_or_outside_the_block_binds_nothing():
    grid = _grid()
    assert sr.sun_bounds(_report("sun", start="23:00", end="23:50"), grid, EDT) == "the sun was not up between those times"
    assert sr.sun_bounds(_report("sun", spot=(44.01, -72.0)), grid, EDT) == "the spot is outside this block"


def test_the_clock_is_the_blocks_zone_else_a_whole_hour_from_longitude():
    tz, known = sr.local_tz("America/New_York", -72.0)
    assert known and tz.key == "America/New_York"
    tz, known = sr.local_tz("Mars/Olympus", -72.0)
    assert not known and tz == timedelta(hours=-5)
    tz, known = sr.local_tz(None, 151.2)
    assert not known and tz == timedelta(hours=10)


# ── agreement → correction ───────────────────────────────────────────────────

def test_three_sun_reports_fell_a_tree_the_imagery_still_shows():
    grid = _grid()
    before = _horizon(grid, 80.0, SOUTH)  # a wall of trees to the south, higher than any June sun
    after, account = sr.apply(before, grid, [_report("sun") for _ in range(3)], EDT)
    cell = grid.nearest(*SPOT)
    assert account["cells_corrected"] >= 1 and account["used"] == 3 and account["why_not"] is None
    lowered = after.canopy[cell] < before.canopy[cell]
    assert lowered.any() and not lowered[[b for b in range(hz.AZ_BINS) if b not in SOUTH]].any()
    # Lowered to just under the sun, not to the ground: the tree may still be there, shorter.
    assert 50.0 <= after.canopy_deg()[cell][lowered].max() <= 69.0
    assert before.canopy[cell].max() == 800  # the input is untouched


def test_two_reports_are_a_record_not_a_correction():
    grid = _grid()
    before = _horizon(grid, 80.0, SOUTH)
    after, account = sr.apply(before, grid, [_report("sun") for _ in range(2)], EDT)
    assert after is before
    assert account["cells_corrected"] == 0 and account["awaiting_agreement"] > 0
    assert "3 reports agree" in account["why_not"]


def test_three_shade_reports_plant_a_tree_the_imagery_missed():
    grid = _grid()
    before = _horizon(grid)  # open sky everywhere
    after, account = sr.apply(before, grid, [_report("shade", day="2026-12-14") for _ in range(3)], EDT)
    cell = grid.nearest(*SPOT)
    assert account["cells_corrected"] >= 1
    raised = after.canopy[cell] > 0
    # December noon at 44° N is about 22° up: the new tree line clears it, by the margin.
    assert raised.any() and 20.0 <= after.canopy_deg()[cell][raised].min() <= 26.0
    assert (after.kind[cell][raised] == hz.KIND_EVERGREEN).all()
    assert (after.terrain == before.terrain).all()  # ground does not grow


def test_sun_and_shade_on_the_same_spot_and_hours_cancel_to_no_change():
    grid = _grid()
    before = _horizon(grid, 80.0, SOUTH)
    reports = [_report("sun") for _ in range(3)] + [_report("shade") for _ in range(3)]
    after, account = sr.apply(before, grid, reports, EDT)
    assert after is before and account["conflicting"] > 0 and account["cells_corrected"] == 0


def test_the_median_report_wins_so_one_wrong_clock_moves_the_answer_one_rank():
    grid = _grid()
    before = _horizon(grid, 80.0, SOUTH)
    honest = [_report("sun", start="11:30", end="12:30") for _ in range(2)]
    early = [_report("sun", start="06:30", end="07:00")]  # dawn: a bound near the ground
    after, _ = sr.apply(before, grid, honest + early, EDT)
    cell = grid.nearest(*SPOT)
    # The dawn report's bins are not the noon bins, so they stand alone and move nothing;
    # the noon bins carry the two honest bounds and one rank cannot fell them further.
    low = after.canopy_deg()[cell]
    assert (low[[b for b in range(hz.AZ_BINS) if b * hz.AZ_STEP_DEG < 100]] == 0).all()


def test_the_account_lists_every_report_with_its_fate():
    grid = _grid()
    reports = [_report("sun"), _report("sun", start="23:00", end="23:30", note="moonlit")]
    _, account = sr.apply(_horizon(grid), grid, reports, EDT)
    assert account["reports"] == 2 and account["used"] == 1
    rows = account["rows"]
    assert rows[0]["used"] and rows[0]["from"] == "11:00" and rows[0]["azimuth_bins"] > 0
    assert not rows[1]["used"] and rows[1]["why_not"] == "the sun was not up between those times"
    assert rows[1]["note"] == "moonlit"
