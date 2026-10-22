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
