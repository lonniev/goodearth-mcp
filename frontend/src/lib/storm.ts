// The barometer's warning in a few words — "Storm likely · Sat" — for the
// Dashboard chip and the Almanac banner, so the two never disagree.
//
// `worst.at` is on the BLOCK's clock and carries no zone; it is read as text,
// never through the device's time zone.

import { languageLocale } from "@tollbooth-dpyc/web";
import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";
import type { StormSignal } from "./mcp.ts";

const LEVEL: Record<StormSignal["level"], MessageKey | ""> = {
  none: "", unsettled: "lib.storm.level.unsettled", "storm likely": "lib.storm.level.likely",
  severe: "lib.storm.level.severe",
};

export function stormLevel(s: StormSignal): string {
  const key = LEVEL[s.level];
  return key ? tr(key) : "";
}

/// Whether the worst fall is already here.
export function stormIsNow(s: StormSignal): boolean {
  const at = s.worst?.at;
  return !at || at <= s.at;
}

/// "now", or the weekday of the worst fall when it is ahead.
export function stormWhen(s: StormSignal): string {
  const at = s.worst?.at;
  if (!at || stormIsNow(s)) return tr("lib.storm.now");
  if (at.slice(0, 10) === s.at.slice(0, 10)) return tr("lib.storm.today");
  return new Date(`${at.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString(languageLocale(), { weekday: "short", timeZone: "UTC" });
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

/// A zone's word as the face shows it. `word` itself is the zone's name in code.
export function faceWord(word: (typeof FACE.zones)[number]["word"]): string {
  return tr(`lib.storm.face.${word}`);
}

/// Where a reading sits on that face, 0..1, held to its ends.
export function onFace(hpa: number): number {
  return Math.min(1, Math.max(0, (hpa - FACE.from) / (FACE.to - FACE.from)));
}

/// The tendency as one arrow: ↘ falling, ↗ rising, → steady.
export function tendencyArrow(s: StormSignal): string {
  const d = s.tendency?.direction;
  return d === "falling" ? "↘" : d === "rising" ? "↗" : "→";
}

/// Which way a day's mean pressure moved from the day before. Under 2 hPa is
/// steady: a daily mean drifts that much on a quiet day.
export function dayTrend(today: number, before: number | null | undefined): "rising" | "falling" | "steady" | null {
  if (before == null) return null;
  const d = today - before;
  return Math.abs(d) < 2 ? "steady" : d > 0 ? "rising" : "falling";
}
