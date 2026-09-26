// Every saved plot as a shape to draw on one map.
//
// Plots overlap and nest by design — a bed inside a field, a meadow inside the
// farm — so the order they are drawn in decides which one a tap lands on. The
// largest goes down first and the smallest last, on top, so every plot keeps
// some ground that only it answers a tap on.

import { areaM2, geoJSONToRing, type LatLng } from "./geo.ts";

export type PlotShape =
  | { id: string; name: string; kind: "polygon"; ring: LatLng[]; m2: number }
  | { id: string; name: string; kind: "pin"; centre: LatLng; radiusM: number; m2: number };

type Pin = { lat: number; lon: number; radius_m: number };
type Poly = { coordinates: number[][][] };

export function plotShapes(plots: { id: string; name: string; region: Pin | Poly }[]): PlotShape[] {
  const shapes: PlotShape[] = [];
  for (const p of plots) {
    if ("lat" in p.region) {
      const { lat, lon, radius_m } = p.region;
      shapes.push({ id: p.id, name: p.name, kind: "pin", centre: { lat, lng: lon },
        radiusM: radius_m, m2: Math.PI * radius_m ** 2 });
    } else {
      const ring = geoJSONToRing(p.region);
      if (ring.length < 3) continue;
      shapes.push({ id: p.id, name: p.name, kind: "polygon", ring, m2: areaM2(ring) });
    }
  }
  return shapes.sort((a, b) => b.m2 - a.m2);
}
