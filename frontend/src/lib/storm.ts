// The barometer's warning in a few words — "Storm likely · Sat" — for the
// Dashboard chip and the Almanac banner, so the two never disagree.
//
// `worst.at` is on the BLOCK's clock and carries no zone; it is read as text,
// never through the device's time zone.

import type { StormSignal } from "./mcp.ts";

const LEVEL: Record<StormSignal["level"], string> = {
  none: "", unsettled: "Unsettled", "storm likely": "Storm likely", severe: "Severe storm signal",
};

export function stormLevel(s: StormSignal): string {
  return LEVEL[s.level];
}

/// "now", or the weekday of the worst fall when it is ahead.
export function stormWhen(s: StormSignal): string {
  const at = s.worst?.at;
  if (!at || at <= s.at) return "now";
  if (at.slice(0, 10) === s.at.slice(0, 10)) return "today";
  return new Date(`${at.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export function stormWords(s: StormSignal): string {
  return s.level === "none" ? "" : `${stormLevel(s)} · ${stormWhen(s)}`;
}

/// The words on an aneroid barometer's face, as hPa spans: the dial a grower
/// already reads a barometer by. The bounds are the classic inHg marks (28.9,
/// 29.4, 30.1, 30.6) converted; the face runs a little past them each side.
export const FACE = {
  from: 970, to: 1045,
  zones: [
    { from: 970, to: 979, word: "stormy" },
    { from: 979, to: 996, word: "rain" },
    { from: 996, to: 1019, word: "change" },
    { from: 1019, to: 1036, word: "fair" },
    { from: 1036, to: 1045, word: "dry" },
  ],
} as const;

/// Where a reading sits on that face, 0..1, held to its ends.
export function onFace(hpa: number): number {
  return Math.min(1, Math.max(0, (hpa - FACE.from) / (FACE.to - FACE.from)));
}

/// The tendency as one arrow: ↘ falling, ↗ rising, → steady.
export function tendencyArrow(s: StormSignal): string {
  const d = s.tendency?.direction;
  return d === "falling" ? "↘" : d === "rising" ? "↗" : "→";
}
