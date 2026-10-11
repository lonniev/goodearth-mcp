"""Organic rooms and beds: a capacity-constrained power diagram.

Poisson-disk seeds, then a power diagram whose weights are solved until every
cell holds its target area, with an occasional Lloyd step to tidy shapes.
Lloyd alone evens areas by driving the seeds toward a crystal-regular
honeycomb, which is exactly the irregularity an organic layout wants kept;
the weights do the area work instead.
"""

from __future__ import annotations

import math

import numpy as np
from shapely.geometry import Point, Polygon

from .frame import largest

LEARN = 0.45
MAX_ITER = 60
TOLERANCE = 0.04
LLOYD_EVERY = 6
BIG = 1e5


def poisson_seeds(region: Polygon, n: int, rng: np.random.Generator) -> np.ndarray:
    """n points inside the region, no two closer than a shrinking radius."""
    minx, miny, maxx, maxy = region.bounds
    r = 0.8 * math.sqrt(region.area / max(n, 1))
    pts: list[tuple[float, float]] = []
    tries = 0
    while len(pts) < n:
        x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        tries += 1
        if tries % (40 * n) == 0:
            r *= 0.85
        if not region.contains(Point(x, y)):
            continue
        if all((x - a) ** 2 + (y - b) ** 2 >= r * r for a, b in pts):
            pts.append((x, y))
    return np.array(pts, dtype=float)


def _half_plane(p: np.ndarray, q: np.ndarray, wp: float, wq: float) -> Polygon:
    """The side of the power wall between p and q that belongs to p."""
    d = float(np.linalg.norm(q - p))
    n = (q - p) / d
    c = (float(q @ q) - float(p @ p) + wp - wq) / (2 * d)
    on = n * c
    t = np.array([-n[1], n[0]])
    return Polygon([on + t * BIG, on - t * BIG, on - t * BIG - n * BIG, on + t * BIG - n * BIG])


def power_cells(region: Polygon, seeds: np.ndarray, w: np.ndarray) -> list[Polygon]:
    cells = []
    for i in range(len(seeds)):
        cell = region
        for j in range(len(seeds)):
            if i != j and np.any(seeds[i] != seeds[j]):
                cell = cell.intersection(_half_plane(seeds[i], seeds[j], w[i], w[j]))
                if cell.is_empty:
                    break
        cells.append(largest(cell))
    return cells


def partition(region: Polygon, sizes: list[float], rng: np.random.Generator) -> list[Polygon]:
    """Split the region into len(sizes) cells, each near its share of the area."""
    n = len(sizes)
    if n == 1:
        return [region]
    total = sum(sizes)
    target = np.array([region.area * s / total for s in sizes])
    seeds = poisson_seeds(region, n, rng)
    w = np.zeros(n)
    clamp = 4 * region.area / n
    cells = power_cells(region, seeds, w)
    for it in range(MAX_ITER):
        areas = np.array([c.area for c in cells])
        if np.max(np.abs(areas - target) / target) < TOLERANCE:
            break
        w += LEARN * (target - areas)
        w -= w.mean()
        w = np.clip(w, -clamp, clamp)
        if it % LLOYD_EVERY == LLOYD_EVERY - 1:
            seeds = np.array([[c.centroid.x, c.centroid.y] if not c.is_empty else s
                              for c, s in zip(cells, seeds, strict=True)])
        cells = power_cells(region, seeds, w)
    return cells


def sizes_for(n: int, size_mix: list[float], irregularity: float, rng: np.random.Generator) -> list[float]:
    """Relative sizes: the mix dealt out across n cells, jittered by irregularity."""
    mix = size_mix or [1.0]
    dealt = [mix[i % len(mix)] for i in range(n)]
    rng.shuffle(dealt)
    return [s * float(rng.uniform(1 - 0.4 * irregularity, 1 + 0.4 * irregularity)) for s in dealt]
