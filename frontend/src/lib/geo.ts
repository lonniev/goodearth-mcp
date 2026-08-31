// Geometry a grower can check against their own field book.
//
// Farmers think in acres. A polygon drawn on a screen is only trustworthy if
// the acreage it reports matches the number they already know for that block,
// so area is computed properly — spherical excess on the WGS-84 sphere, not a
// flat shoelace that drifts with latitude.

const R = 6_378_137; // WGS-84 equatorial radius, metres
const RAD = Math.PI / 180;

export type LatLng = { lat: number; lng: number };

/// Spherical polygon area in square metres.
export function areaM2(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    total += (b.lng - a.lng) * RAD * (2 + Math.sin(a.lat * RAD) + Math.sin(b.lat * RAD));
  }
  return Math.abs((total * R * R) / 2);
}

export const M2_PER_ACRE = 4046.8564224;
export const M2_PER_HA = 10_000;

export function acres(m2: number): number { return m2 / M2_PER_ACRE; }
export function hectares(m2: number): number { return m2 / M2_PER_HA; }

/// "3.2 acres · 1.3 ha" — both, because a grower's paperwork uses one and the
/// data grid uses the other.
export function formatArea(m2: number): string {
  const a = acres(m2), h = hectares(m2);
  if (m2 < 400) return `${Math.round(m2).toLocaleString()} m²`;
  return `${a < 10 ? a.toFixed(2) : a.toFixed(1)} acres · ${h < 10 ? h.toFixed(2) : h.toFixed(1)} ha`;
}

/// Great-circle distance in metres.
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/// GeoJSON wants [lng, lat] and a closed ring; Leaflet gives {lat, lng} open.
export function ringToGeoJSON(ring: LatLng[]): { type: "Polygon"; coordinates: number[][][] } {
  const coords = ring.map((p) => [Number(p.lng.toFixed(6)), Number(p.lat.toFixed(6))]);
  const last = coords[coords.length - 1];
  if (coords.length && (coords[0][0] !== last[0] || coords[0][1] !== last[1])) {
    coords.push(coords[0]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

export function geoJSONToRing(g: { coordinates: number[][][] }): LatLng[] {
  const ring = g.coordinates?.[0] ?? [];
  const tail = ring[ring.length - 1];
  const open =
    ring.length > 1 && tail && ring[0][0] === tail[0] && ring[0][1] === tail[1]
      ? ring.slice(0, -1)
      : ring;
  return open.map(([lng, lat]) => ({ lat, lng }));
}

/// A polygon needs three distinct corners to enclose anything.
export function isDrawable(ring: LatLng[]): boolean {
  return ring.length >= 3 && areaM2(ring) > 1;
}

/// Nominatim — OpenStreetMap's free geocoder, no key. Rate-limited to about
/// one call a second, which a type-ahead would blow through, so the caller
/// debounces and this only runs on an explicit search.
export interface Place { name: string; lat: number; lng: number }

export async function searchPlace(q: string, signal?: AbortSignal): Promise<Place[]> {
  if (!q.trim()) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Place search failed (${r.status})`);
  const rows = (await r.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((x) => ({ name: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
}
