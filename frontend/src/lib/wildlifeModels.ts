// The grower's wildlife calendar.
//
// Like the pest models, these are the patron's own. Good Earth works out when
// a threshold arrives on their ground; it does not publish natural history —
// the number that is right for a particular valley belongs to a local
// naturalist, an extension bulletin, or the grower's own years of noticing.
//
// The starters below are shapes to edit, and are labelled that way wherever
// they appear. They are chosen to show all three clocks rather than to be
// authoritative.

import type { WildlifeEventInput } from "./mcp";

export interface SavedWildlife extends WildlifeEventInput {
  id: string;
  regionId: string;
}

const KEY = "goodearth:wildlife:v1";

export const WILDLIFE_STARTERS: WildlifeEventInput[] = [
  { species: "American robin", event: "first arrival", driver: "daylight",
    daylight_hours: 11.5, rising: true, emoji: "🐦",
    note: "Arrival tracks lengthening days and the thaw line — edit to your own record." },
  { species: "Red-winged blackbird", event: "first song", driver: "daylight",
    daylight_hours: 11, rising: true, emoji: "🐦‍⬛" },
  { species: "Canada goose", event: "southbound flights", driver: "daylight",
    daylight_hours: 12.5, rising: false, emoji: "🪿" },
  { species: "Woodchuck", event: "emergence", driver: "heat",
    gdd: 120, base_temp: 43, emoji: "🦫" },
  { species: "Grey squirrel", event: "nut caching begins", driver: "calendar",
    typical_on: "09-15", emoji: "🐿️" },
  { species: "Monarch", event: "southbound passage", driver: "heat",
    gdd: 2400, base_temp: 50, emoji: "🦋" },
  { species: "Spring peeper", event: "first chorus", driver: "heat",
    gdd: 90, base_temp: 43, emoji: "🐸" },
  { species: "White-tailed deer", event: "rut begins", driver: "daylight",
    daylight_hours: 10.5, rising: false, emoji: "🦌" },
];

export const DRIVER_HELP: Record<string, string> = {
  heat: "A degree-day threshold — moves with the season, like a crop.",
  daylight: "A day-length threshold — astronomy, so it barely moves year to year.",
  calendar: "A date from your own record, for events with no clean driver.",
};

function read(): SavedWildlife[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedWildlife[]) : [];
  } catch { return []; }
}

function write(all: SavedWildlife[]): SavedWildlife[] {
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* noop */ }
  return all;
}

export function listWildlife(regionId?: string): SavedWildlife[] {
  const all = read();
  return regionId ? all.filter((w) => w.regionId === regionId) : all;
}

export function saveWildlife(w: SavedWildlife): SavedWildlife[] {
  return write([...read().filter((x) => x.id !== w.id), w]);
}

export function deleteWildlife(id: string): SavedWildlife[] {
  return write(read().filter((x) => x.id !== id));
}

/// Validate the way the server does, so the grower is corrected in the form.
export function makeWildlife(
  input: WildlifeEventInput, regionId: string,
): SavedWildlife | string {
  if (!input.species?.trim()) return "Which creature?";
  if (!input.event?.trim()) return "What does it do — 'first arrival', 'emergence'?";
  if (input.driver === "heat") {
    if (!Number.isFinite(input.gdd) || input.gdd! <= 0 || input.gdd! > 20_000)
      return "A heat-driven event needs a realistic GDD threshold.";
    if (input.base_temp != null && (input.base_temp < 20 || input.base_temp > 80))
      return "Base temperature must be between 20 and 80 °F.";
  } else if (input.driver === "daylight") {
    if (!Number.isFinite(input.daylight_hours) || input.daylight_hours! <= 0 || input.daylight_hours! >= 24)
      return "A daylight-driven event needs an hours figure between 0 and 24.";
  } else {
    if (!/^\d{2}-\d{2}$/.test(input.typical_on ?? ""))
      return "A calendar event needs a typical date as MM-DD.";
  }
  return {
    ...input,
    species: input.species.trim(),
    event: input.event.trim(),
    id: `wl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    regionId,
  };
}
