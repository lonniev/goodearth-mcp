"""Cross-check Good Earth's solar yield against PVGIS — live, by hand.

Lives here and not under ``tests/`` because ``tests/conftest.py`` refuses
every network socket on purpose: a check that depends on two public services
being up is a check to run before a release, not on every commit.

For three generic sites (never a grower's plot) — Vermont, Germany and the
southern hemisphere, so the azimuth convention is exercised — it casts the
real horizon, computes the yield exactly as the tool does, then sends the
same cell's horizon to PVGIS 5.2 ``PVcalc`` with the same tilt, facing and
a 14 % system loss, and compares annual kWh per kWp. Open sky is compared
too, which tests the radiation climatology and the plane-of-array model on
their own. The tolerance is the brief's ±10 %.

    uv run python scripts/sunlight_pvgis_check.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime

import httpx
import numpy as np

from goodearth_mcp import horizon as hz
from goodearth_mcp import solar, sunlight_window, sunpath
from goodearth_mcp.region import M_PER_DEG_LAT, m_per_deg_lon

PVGIS = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"
TOLERANCE = 0.10
SITES = [
    ("Vermont", 44.26, -72.58, "PVGIS-NSRDB"),
    ("Germany", 49.00, 8.40, "PVGIS-SARAH2"),
    ("Canberra", -35.30, 149.10, "PVGIS-ERA5"),
]
SIDE_M = 60.0


def _square(lat: float, lon: float) -> list[tuple[float, float]]:
    d_lat = SIDE_M / M_PER_DEG_LAT
    d_lon = SIDE_M / m_per_deg_lon(lat)
    return [(lat, lon), (lat, lon + d_lon), (lat + d_lat, lon + d_lon), (lat + d_lat, lon)]


async def pvgis(lat: float, lon: float, tilt: float, azimuth: float, horizon_deg: list[float], db: str) -> float:
    params = {
        "lat": lat, "lon": lon, "peakpower": 1, "loss": 14, "angle": tilt,
        # PVGIS counts aspect from south: 0 south, 90 west, -90 east.
        "aspect": ((azimuth - 180.0 + 180.0) % 360.0) - 180.0,
        "outputformat": "json", "raddatabase": db,
        "userhorizon": ",".join(f"{h:.1f}" for h in horizon_deg),
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.get(PVGIS, params=params)
        r.raise_for_status()
        return float(r.json()["outputs"]["totals"]["fixed"]["E_y"])


async def check(name: str, lat: float, lon: float, db: str) -> list[tuple[str, float, float]]:
    today = datetime.now(UTC).date()
    grid = hz.build_grid(_square(lat, lon))
    rec = await asyncio.to_thread(sunlight_window._fetch_and_cast, grid)
    clim = await sunlight_window._climatology_for(lat, lon, today)
    if clim is None:
        raise SystemExit(f"{name}: the radiation archive gave too few years")
    mean, _years = clim
    tilt, azimuth = solar.default_tilt(lat), solar.default_azimuth(lat)
    days = sunpath.representative_days(today.year)
    elev, az = sunpath.sun_position(grid.lat0, grid.lon0, days, sunpath.HOURS_MID)
    open_sky = solar.poa_monthly(None, mean, elev, az, tilt, azimuth, list(range(1, 13)), today.year)
    shaded = solar.poa_monthly(rec.horizon, mean, elev, az, tilt, azimuth, list(range(1, 13)), today.year)
    ours = solar.yields(open_sky, shaded)

    cell = grid.nearest(grid.lat0, grid.lon0) or 0
    line = np.maximum(rec.horizon.terrain_deg()[cell], rec.horizon.canopy_deg()[cell]).tolist()
    rows = [
        ("open sky", float(ours["open_sky_kwh_per_kwp"]), await pvgis(lat, lon, tilt, azimuth, [0.0] * 72, db)),
        ("centre cell", float(ours["kwh_per_kwp"][cell]), await pvgis(lat, lon, tilt, azimuth, line, db)),
    ]
    return [(f"{name} {label} (tilt {tilt:g}, az {azimuth:g})", a, b) for label, a, b in rows]


async def main() -> int:
    rows = []
    for name, lat, lon, db in SITES:
        rows += await check(name, lat, lon, db)
    worst = 0.0
    print(f"{'site':44} {'Good Earth':>11} {'PVGIS':>9} {'diff':>7}")
    for label, ours, theirs in rows:
        diff = (ours - theirs) / theirs
        worst = max(worst, abs(diff))
        print(f"{label:44} {ours:11.0f} {theirs:9.0f} {diff:+7.1%}")
    print(f"worst {worst:.1%} against a tolerance of {TOLERANCE:.0%}")
    return 0 if worst <= TOLERANCE else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
