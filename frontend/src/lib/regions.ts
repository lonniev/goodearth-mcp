// Saved regions (Favorites) — a cache in front of the server's blocks.
//
// The region is the app's unifying abstraction: switching the active region
// re-scopes every view. The record itself lives in the operator's database,
// npub-scoped and encrypted at rest, so a farm survives a lost laptop and
// reads the same on a phone.
//
// localStorage stays, demoted to a first-paint cache. That is deliberate:
// `listRegions()` is called synchronously before the first render and every
// view assumes a region exists, so making it async would push a null check
// into eleven components and put a loading flash on every route. Instead the
// server becomes the WRITER of this key — `hydrate()` below — and the reader
// never learns the difference.
//
// (An earlier version of this comment claimed a charter placing these on Nostr
// as NIP-44 events that "never live on the operator's server". There is no such
// charter. It was an aspiration written in the voice of doctrine, and it misled
// at least one reader before being corrected.)

import type { Region } from "./mcp";

/// `KEY_BASE` alone — with no npub appended — is the UNSCOPED pile every
/// patron on this browser wrote to before the scoping below. It is
/// `migrateBlocks`'s source and nothing else reads it: whose ground is in it
/// cannot be known, so it is lifted to the server and never shown.
const KEY_BASE = "goodearth:regions:v1";
const ACTIVE_KEY_BASE = "goodearth:active-region:v1";

/// Which npub this browser is signed in as, read straight from storage rather
/// than through `mcp` — importing it here would be a cycle, since `mcp` needs
/// this module's `Region`.
function patron(): string {
  try {
    return window.localStorage.getItem("goodearth:patron_npub:v1") ?? "";
  } catch {
    return "";
  }
}

/// Scoped to the patron, because two npubs in one browser sharing one active
/// id means the second signs in pointing at ground the server will not resolve
/// for them.
function activeKey(): string {
  return `${ACTIVE_KEY_BASE}:${patron()}`;
}

/// The blocks cache, scoped the same way — and it was NOT, which is the bug
/// this comment exists for.
///
/// The reasoning above was written for the active id and never applied to the
/// blocks themselves, so a second npub on one browser read the first's cache:
/// a new patron signed in and saw a farm's name, its town, its acreage and
/// tonight's conditions for ground they have never seen, and every paid call
/// they made was about it. Reported 2026-09-05 with a screenshot of exactly
/// that.
///
/// The suffix is appended even when there is no npub, so a signed-out reader
/// gets its own empty scope rather than falling back to the shared pile.
function key(): string {
  return `${KEY_BASE}:${patron()}`;
}

/// Square metres in an acre. Named so the radius below shows its working.
const M2_PER_ACRE = 4046.8564224;

/// What a first block is proposed as: about 25 acres, centred on wherever the
/// grower is standing.
///
/// A circle, because `parse_region` treats a pin as one — `area = πr²`, and a
/// sample is inside if `hypot ≤ r`. So the radius falls out of the acreage
/// rather than being picked: `√(25 · 4046.86 / π)` ≈ 180 m.
///
/// Ten acres was the first thought and is too small to say anything. The
/// weather grid is 2 km, so a ten-acre block sits inside ONE cell and the
/// spread across it — the whole claim this service makes — comes back nil on
/// flat ground. Twenty-five is still plainly a small farm and stands a chance
/// of crossing a contour. It is a proposal; the grower moves it.
export const HOME_ACRES = 25;
export const HOME_RADIUS_M = Math.round(Math.sqrt((HOME_ACRES * M2_PER_ACRE) / Math.PI));

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
  const saved = read<SavedRegion[]>(key(), []);
  // The example is always available but never persisted, so it cannot be
  // orphaned by a schema change or clutter an established grower's list once
  // they have their own ground saved.
  return saved.length ? saved : [EXAMPLE_REGION];
}

/// Replace the cache with what the server holds.
///
/// Called once after sign-in. The server is authoritative, so this overwrites
/// rather than merges — anything the device still held that the server does not
/// know about has either been migrated already or was never saved.
export function hydrate(rows: SavedRegion[]): SavedRegion[] {
  try {
    window.localStorage.setItem(key(), JSON.stringify(rows));
  } catch { /* private window / quota — this session still works from memory */ }
  return rows;
}

export function saveRegion(r: SavedRegion): SavedRegion[] {
  const all = read<SavedRegion[]>(key(), []).filter((x) => x.id !== r.id);
  const next = [...all, r];
  try {
    window.localStorage.setItem(key(), JSON.stringify(next));
  } catch {
    /* private window / quota — the region is still usable this session */
  }
  return next;
}

export function deleteRegion(id: string): SavedRegion[] {
  const next = read<SavedRegion[]>(key(), []).filter((x) => x.id !== id);
  try {
    window.localStorage.setItem(key(), JSON.stringify(next));
  } catch { /* noop */ }
  return next;
}

export function getActiveRegionId(): string | null {
  try { return window.localStorage.getItem(activeKey()); } catch { return null; }
}

export function setActiveRegionId(id: string): void {
  try { window.localStorage.setItem(activeKey(), id); } catch { /* noop */ }
}

/// A pin region from plain numbers, validated the way the server validates it
/// so the grower is told in the form rather than by a failed paid call.
/// A first block, proposed around a point. Named for what it is rather than
/// where: a grower renames it, and "Home block" is true until they do.
export function proposeHomeBlock(lat: number, lon: number, name = "Home block"): SavedRegion | string {
  return pinRegion(name, lat, lon, HOME_RADIUS_M);
}

export function pinRegion(name: string, lat: number, lon: number, radiusM: number, baseTempF = 50): SavedRegion | string {
  if (!name.trim()) return "Give your ground a name you'll recognise.";
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
  if (!name.trim()) return "Give your ground a name you'll recognise.";
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
