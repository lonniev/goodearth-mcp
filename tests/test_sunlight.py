"""Garden light: hours counted honestly, classes at the nursery-label edges."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from goodearth_mcp import almanac, sources, sunlight, sunpath
from goodearth_mcp import horizon as hz


def _horizon(n: int = 1) -> hz.Horizon:
    return hz.Horizon(
        terrain=np.zeros((n, 72), np.uint16), canopy=np.zeros((n, 72), np.uint16), kind=np.zeros((n, 72), np.uint8),
    )


def _sun(lat: float = 44.26, lon: float = -72.58):
    return sunpath.sun_position(lat, lon, sunpath.representative_days(2024))


def test_open_sky_hours_match_the_almanac_day_length():
    elev, az = _sun()
    hours = sunlight.direct_hours(_horizon(), elev, az, list(range(1, 13)))
    for m, d in ((6, date(2024, 6, 15)), (12, date(2024, 12, 15))):
        assert hours[0, m - 1] == pytest.approx(almanac.day_length_hours(44.26, d), abs=0.4)


def test_a_southern_wall_takes_december_and_spares_june():
    h = _horizon()
    h.terrain[0, 24:49] = 200  # 20° of ground from 120° to 240°
    h.canopy[0, 24:49] = 200
    elev, az = _sun()
    hours = sunlight.direct_hours(h, elev, az, list(range(1, 13)))
    open_sky = sunlight.open_sky_hours(elev)
    assert hours[0, 5] == pytest.approx(open_sky[5], abs=0.2)
    assert hours[0, 11] < open_sky[11] / 2


def test_bare_deciduous_passes_half_evergreen_none():
    h = _horizon(2)
    h.canopy[:, 24:49] = 600
    h.kind[0, 24:49] = hz.KIND_DECIDUOUS
    h.kind[1, 24:49] = hz.KIND_EVERGREEN
    elev, az = _sun()
    in_leaf = sunlight.direct_hours(h, elev, az, leaf_on=list(range(1, 13)))
    bare = sunlight.direct_hours(h, elev, az, leaf_on=[])
    open_sky = sunlight.open_sky_hours(elev)
    assert in_leaf[0, 11] == in_leaf[1, 11] < 0.5  # nothing clears 60° in December
    assert bare[0, 11] == pytest.approx(open_sky[11] * 0.5, abs=0.3)
    assert bare[1, 11] == in_leaf[1, 11]


def test_classes_at_the_exact_edges():
    assert sunlight.classify(np.array([6.0, 5.99, 3.0, 2.99])).tolist() == [0, 1, 1, 2]


def _normals(monthly_mean_f: list[float]) -> list[dict]:
    dates, hi, lo = [], [], []
    for m, mean in enumerate(monthly_mean_f, start=1):
        for d in (1, 15):
            dates.append(f"2020-{m:02d}-{d:02d}")
            hi.append(mean + 10.0)
            lo.append(mean - 10.0)
    return [{"daily": {"time": dates, "temperature_2m_max": hi, "temperature_2m_min": lo}}]


def test_leaf_on_months_follow_the_blocks_own_climate():
    vermont = [18, 22, 32, 44, 56, 65, 70, 68, 60, 48, 37, 25]
    assert sunlight.leaf_on_months(_normals(vermont)) == [5, 6, 7, 8, 9]
    assert sunlight.leaf_on_months(_normals([80.0] * 12)) == list(range(1, 13))
    with pytest.raises(sources.UpstreamError):
        sunlight.leaf_on_months([{"daily": None}])


def test_month_summary_shares_sum_to_one_and_extremes_are_in_the_block():
    g = hz.build_grid([(44.0, -72.0), (44.0, -71.9995), (44.0004, -71.9995), (44.0004, -72.0)])
    rng = np.random.default_rng(5)
    hours = rng.uniform(0, 12, g.n).astype(np.float32)
    s = sunlight.month_summary(hours, g, 6, True)
    assert sum(s["share"].values()) == pytest.approx(1.0, abs=0.002)
    assert s["p10_hours"] <= s["median_hours"] <= s["p90_hours"]
    assert g.min_lat <= s["sunniest"]["lat"] <= g.max_lat and g.min_lon <= s["shadiest"]["lon"] <= g.max_lon
    assert s["sunniest"]["hours"] == pytest.approx(float(hours.max()), abs=0.05)
