"""Solar yield — what a fixed panel would make on each part of a block.

A screening estimate, not a site survey, and it says so. Ten years of the
ERA5 archive's hourly radiation are averaged into a typical year by month and
hour; the sun's position on each month's representative day puts that
radiation onto a tilted plane with the isotropic sky model; the cell's
horizon decides which hours the beam arrives and how much of the sky dome
the diffuse light has. A performance ratio turns plane-of-array energy into
AC per kW installed.

The figures are open-sky yield, shaded yield, and their ratio — solar
access — which is the number a shade report quotes. Tilt and facing are the
grower's inputs; the defaults face the equator at a tilt near the latitude.
"""

from __future__ import annotations

from calendar import monthrange
from typing import Any

import numpy as np

from goodearth_mcp.horizon import Horizon
from goodearth_mcp.sunlight import LEAF_OFF_TRANSMITTANCE, transmittance

#: AC energy per plane-of-array energy: wiring, inverter, soiling, temperature.
#: PVWatts' default 14 % system losses plus inverter losses land about here.
PERFORMANCE_RATIO = 0.80
#: Ground reflectance for the isotropic model's ground term.
ALBEDO = 0.2
#: A fixed array's default tilt is the latitude, no steeper than this.
MAX_DEFAULT_TILT_DEG = 40.0
CLIMATOLOGY_YEARS = 10
#: Fewer years than this and the typical year is not typical: no solar figure.
MIN_CLIMATOLOGY_YEARS = 5
#: Hourly fields, in the order the climatology stacks them.
RADIATION_FIELDS = ("direct_normal_irradiance", "diffuse_radiation", "shortwave_radiation")
DNI, DHI, GHI = 0, 1, 2


def default_tilt(lat: float) -> float:
    return round(min(abs(lat), MAX_DEFAULT_TILT_DEG), 1)


def default_azimuth(lat: float) -> float:
    """Equator-facing: 180 (south) north of the equator, 0 (north) south of it."""
    return 180.0 if lat >= 0 else 0.0


# ── Climatology ──────────────────────────────────────────────────────────


def reduce_year(hourly: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    """One year's hourly block → sums ``(12, 24, 3)`` and counts ``(12, 24)``.

    Reduced on arrival so no caller ever holds ten years of hourly rows.
    Missing hours are skipped, not zeroed.
    """
    times = hourly.get("time") or []
    sums = np.zeros((12, 24, 3), dtype=np.float64)
    counts = np.zeros((12, 24), dtype=np.float64)
    cols = []
    for field in RADIATION_FIELDS:
        v = hourly.get(field) or []
        cols.append(np.array([np.nan if x is None else float(x) for x in v], dtype=np.float64))
    n = min(len(times), *(len(c) for c in cols))
    if n == 0:
        return sums, counts
    months = np.array([int(t[5:7]) - 1 for t in times[:n]])
    hours = np.array([int(t[11:13]) for t in times[:n]])
    stack = np.stack([c[:n] for c in cols], axis=1)
    ok = ~np.isnan(stack).any(axis=1)
    np.add.at(sums, (months[ok], hours[ok]), stack[ok])
    np.add.at(counts, (months[ok], hours[ok]), 1.0)
    return sums, counts


def climatology(parts: list[tuple[np.ndarray, np.ndarray]]) -> np.ndarray:
    """Mean W/m² by month and hour across the reduced years, ``(12, 24, 3)`` float32."""
    sums = sum((p[0] for p in parts), np.zeros((12, 24, 3)))
    counts = sum((p[1] for p in parts), np.zeros((12, 24)))
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(counts[:, :, None] > 0, sums / counts[:, :, None], 0.0)
    return mean.astype(np.float32)


# ── Plane of array ───────────────────────────────────────────────────────


def sky_view_factor(horizon: Horizon | None, leaf_on: bool) -> np.ndarray:
    """Share of the isotropic sky dome a horizontal surface sees, per cell ``(n,)``.

    Each 5° wedge contributes ``cos²`` of its horizon angle; between the
    terrain line and the canopy line a bare crown passes its transmittance.
    """
    if horizon is None:
        return np.ones(1, dtype=np.float32)
    t = np.radians(horizon.terrain_deg())
    c = np.radians(horizon.canopy_deg())
    through = np.zeros_like(t) if leaf_on else _leaf_off_by_kind(horizon)
    per_bin = np.cos(c) ** 2 + through * (np.cos(t) ** 2 - np.cos(c) ** 2)
    return per_bin.mean(axis=1).astype(np.float32)


_LEAF_OFF = np.zeros(4, dtype=np.float32)
for _k, _v in LEAF_OFF_TRANSMITTANCE.items():
    _LEAF_OFF[_k] = _v


def _leaf_off_by_kind(horizon: Horizon) -> np.ndarray:
    return _LEAF_OFF[horizon.kind]


def incidence_cosine(elev_deg: np.ndarray, az_deg: np.ndarray, tilt_deg: float, panel_az_deg: float) -> np.ndarray:
    """cos of the angle between the sun and a tilted plane's normal, clipped at 0."""
    zen = np.radians(90.0 - elev_deg)
    beta = np.radians(tilt_deg)
    cos_theta = np.cos(zen) * np.cos(beta) + np.sin(zen) * np.sin(beta) * np.cos(np.radians(az_deg - panel_az_deg))
    return np.clip(cos_theta, 0.0, None) * (elev_deg > 0)


def poa_monthly(
    horizon: Horizon | None,
    clim: np.ndarray,
    elev: np.ndarray,
    az: np.ndarray,
    tilt_deg: float,
    panel_az_deg: float,
    leaf_on: list[int],
    year: int,
) -> np.ndarray:
    """Plane-of-array energy per month, kWh/m², ``(n, 12)`` — or ``(1, 12)`` for open sky.

    ``elev, az`` are the sun on each month's representative day at the hour
    midpoints, ``(12, 24)``. Isotropic model:
    POA = DNI·cosθ·S + DHI·SVF·(1+cosβ)/2 + GHI·ρ·(1−cosβ)/2.
    """
    beta = np.radians(tilt_deg)
    diffuse_view = (1.0 + np.cos(beta)) / 2.0
    ground_view = ALBEDO * (1.0 - np.cos(beta)) / 2.0
    n = 1 if horizon is None else horizon.terrain.shape[0]
    out = np.zeros((n, 12), dtype=np.float32)
    for m in range(12):
        in_leaf = (m + 1) in leaf_on
        cos_theta = incidence_cosine(elev[m], az[m], tilt_deg, panel_az_deg)  # (24,)
        if horizon is None:
            beam_share = np.ones((1, 24), dtype=np.float32)
        else:
            beam_share = transmittance(horizon, az[m], elev[m], in_leaf)  # (n, 24)
        svf = sky_view_factor(horizon, in_leaf)[:, None]
        beam = clim[m, :, DNI][None, :] * cos_theta[None, :] * beam_share
        diffuse = clim[m, :, DHI][None, :] * svf * diffuse_view
        ground = clim[m, :, GHI][None, :] * ground_view
        days = monthrange(year, m + 1)[1]
        out[:, m] = (beam + diffuse + ground).sum(axis=1) * days / 1000.0
    return out


def yields(open_sky: np.ndarray, shaded: np.ndarray) -> dict[str, Any]:
    """Annual kWh per kW installed, open and shaded, with solar access per cell."""
    open_year = float(open_sky.sum()) * PERFORMANCE_RATIO
    shaded_year = shaded.sum(axis=1) * PERFORMANCE_RATIO
    access = shaded_year / open_year if open_year > 0 else np.zeros_like(shaded_year)
    return {
        "open_sky_kwh_per_kwp": round(open_year, 0),
        "kwh_per_kwp": shaded_year.astype(np.float32),
        "solar_access": access.astype(np.float32),
        "monthly_open_kwh_per_kwp": [round(float(v) * PERFORMANCE_RATIO, 1) for v in open_sky.ravel()],
    }


__all__ = [
    "ALBEDO", "CLIMATOLOGY_YEARS", "DHI", "DNI", "GHI", "MAX_DEFAULT_TILT_DEG", "MIN_CLIMATOLOGY_YEARS",
    "PERFORMANCE_RATIO", "RADIATION_FIELDS",
    "climatology", "default_azimuth", "default_tilt", "incidence_cosine", "poa_monthly",
    "reduce_year", "sky_view_factor", "yields",
]
