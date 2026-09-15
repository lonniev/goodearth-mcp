// How many bees fly, and how hard — the reading the foraging bees give.
//
// Pure, so the switch in Preferences is honoured in one place. The flight used
// to work out its size twice: once to decide whether to restart (which read the
// switch) and once to spawn (which did not). Turning the bees off restarted the
// flight, cleared it, and then spawned a fresh one at the hive door — they
// vanished and came straight back with the box still unticked.

import type { HiveMood } from "../components/Hive";

/// 0 at the flight threshold, 1 in real working heat.
export function activityOf(tempF: number | null): number {
  if (tempF == null) return 0.4;
  return Math.max(0, Math.min(1, (tempF - 55) / 30));
}

export function beeCount(mood: HiveMood, activity: number): number {
  if (mood === "closed") return 0;
  if (mood === "quiet") return 1;
  if (mood === "unknown") return 2;
  return 2 + Math.round(activity * 4);
}

/// How many bees to fly: none at all when the grower has turned them off,
/// whatever the weather would otherwise call for.
export function flightSize(enabled: boolean, mood: HiveMood, activity: number): number {
  return enabled ? beeCount(mood, activity) : 0;
}
