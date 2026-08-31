// Saved regions (Favorites).
//
// The region is the app's unifying abstraction: switching the active region
// re-scopes every view. Per the charter these belong on Nostr as NIP-44
// encrypted NIP-78 events under `goodearth/regions`, so the farm's data
// survives any one device and never lives on the operator's server.
//
// localStorage is the offline cache in that design, and it is what ships
// first — the Nostr write-through lands with the rest of the patron
// collections. Keeping the store behind this module means that change is
// one file, not a sweep through the views.

import type { Region } from "./mcp";

const KEY = "goodearth:regions:v1";
const ACTIVE_KEY = "goodearth:active-region:v1";

export interface SavedRegion {
  id: string;
  name: string;
  region: Region;
  /// Hectares, from the server's own region description when we have it.
  areaHa?: number;
  sampleCount?: number;
  baseTempF: number;
}

/// A worked example so a first-time grower sees a real answer before drawing
/// anything. Champlain Valley — the ground the tool was developed against.
export const EXAMPLE_REGION: SavedRegion = {
  id: "example-champlain",
  name: "Champlain Valley",
  baseTempF: 50,
  region: {
    type: "Polygon",
    coordinates: [[
      [-73.24, 44.44],
      [-73.16, 44.44],
      [-73.16, 44.52],
      [-73.24, 44.52],
      [-73.24, 44.44],
    ]],
  },
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function listRegions(): SavedRegion[] {
  const saved = read<SavedRegion[]>(KEY, []);
  // The example is always available but never persisted, so it cannot be
  // orphaned by a schema change or clutter an established grower's list once
  // they have their own ground saved.
  return saved.length ? saved : [EXAMPLE_REGION];
}

export function saveRegion(r: SavedRegion): SavedRegion[] {
  const all = read<SavedRegion[]>(KEY, []).filter((x) => x.id !== r.id);
  const next = [...all, r];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private window / quota — the region is still usable this session */
  }
  return next;
}

export function deleteRegion(id: string): SavedRegion[] {
  const next = read<SavedRegion[]>(KEY, []).filter((x) => x.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* noop */ }
  return next;
}

export function getActiveRegionId(): string | null {
  try { return window.localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveRegionId(id: string): void {
  try { window.localStorage.setItem(ACTIVE_KEY, id); } catch { /* noop */ }
}

/// A pin region from plain numbers, validated the way the server validates it
/// so the grower is told in the form rather than by a failed paid call.
export function pinRegion(name: string, lat: number, lon: number, radiusM: number, baseTempF = 50): SavedRegion | string {
  if (!name.trim()) return "Give the block a name you'll recognise.";
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return "Latitude must be between -90 and 90.";
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return "Longitude must be between -180 and 180.";
  if (!Number.isFinite(radiusM) || radiusM <= 0) return "Radius must be a positive number of metres.";
  if (radiusM > 50_000) return "Radius must be 50 km or less — draw a polygon for anything larger.";
  return {
    id: `pin-${Date.now().toString(36)}`,
    name: name.trim(),
    region: { lat, lon, radius_m: radiusM },
    baseTempF,
  };
}

/// Parse a pasted GeoJSON polygon (bare geometry or a Feature). Growers get
/// this from any mapping tool, so accepting both shapes saves them unwrapping
/// it by hand.
export function parsePastedGeoJSON(text: string, name: string, baseTempF = 50): SavedRegion | string {
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { return "That isn't valid JSON."; }
  const o = obj as Record<string, unknown>;
  const geom = (o?.type === "Feature" ? o.geometry : o) as Record<string, unknown> | undefined;
  if (!geom || geom.type !== "Polygon" || !Array.isArray(geom.coordinates)) {
    return "Expected a GeoJSON Polygon (or a Feature wrapping one).";
  }
  const ring = (geom.coordinates as unknown[])[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return "A polygon ring needs at least 4 positions, with the first repeated as the last.";
  }
  if (!name.trim()) return "Give the block a name you'll recognise.";
  return {
    id: `poly-${Date.now().toString(36)}`,
    name: name.trim(),
    region: geom as unknown as Region,
    baseTempF,
  };
}

export function areaHaFromKm2(km2: number): number {
  return km2 * 100;
}
