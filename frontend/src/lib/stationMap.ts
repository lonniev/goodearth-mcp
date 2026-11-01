// What the station map draws: one marker for each station near the plot. A
// station already tracked needs no `choice`, and one tracked far away is left
// to the list so it does not zoom the map out to a continent.

import type { MappedStation, NearbyStationRow } from "./mcp";

export interface StationMarker {
  station_id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  /// How to track it at FieldData; empty when it already is.
  choice: string;
}

const RADIANS = Math.PI / 180;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = lat1 * RADIANS;
  const b = lat2 * RADIANS;
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(((lon2 - lon1) * RADIANS) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function stationMarkers(
  place: { latitude: number; longitude: number },
  tracked: MappedStation[],
  nearby: NearbyStationRow[],
  reachKm: number,
): StationMarker[] {
  const out = new Map<string, StationMarker>();
  for (const s of tracked) {
    if (s.latitude == null || s.longitude == null) continue;
    const distance_km = distanceKm(place.latitude, place.longitude, s.latitude, s.longitude);
    if (distance_km <= reachKm) {
      out.set(s.station_id, { ...s, latitude: s.latitude, longitude: s.longitude, distance_km, choice: "" });
    }
  }
  for (const s of nearby) {
    if (s.latitude == null || s.longitude == null || out.has(s.station_id)) continue;
    out.set(s.station_id, { ...s, latitude: s.latitude, longitude: s.longitude });
  }
  return [...out.values()].sort((a, b) => a.distance_km - b.distance_km);
}
