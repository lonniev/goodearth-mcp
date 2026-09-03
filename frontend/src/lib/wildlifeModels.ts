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

// The starter events that used to live here are gone. Twenty-two species
// chosen to demonstrate three clocks is not the fauna of anyone's farm — the
// owls, bats and coyotes a grower actually hears were never in it. The
// Wildlife page now reads what iNaturalist records around the region — see
// `wildlifeCatalog` in lib/mcp.

export const DRIVER_HELP: Record<string, string> = {
  heat: "A degree-day threshold — moves with the season, like a crop.",
  daylight: "A day-length threshold — astronomy, so it barely moves year to year.",
  interval: "A count of days from a date you set — gestation, incubation, days to lay.",
  calendar: "A date from your own record, for events with no clean driver.",
};

/// Livestock intervals. A ewe's gestation does not care what the season is
/// doing — it is a count of days from the day she was bred, so these are
/// arithmetic rather than weather.
///
/// Figures are typical and breed-dependent; edit them to your own stock.
export const HUSBANDRY_INTERVALS: { species: string; event: string; days: number; emoji: string; from_label: string }[] = [
  { species: "Ewes", event: "lambing", days: 147, emoji: "🐑", from_label: "bred" },
  { species: "Does · goat", event: "kidding", days: 150, emoji: "🐐", from_label: "bred" },
  { species: "Cows", event: "calving", days: 283, emoji: "🐄", from_label: "bred" },
  { species: "Sows", event: "farrowing", days: 114, emoji: "🐖", from_label: "bred" },
  { species: "Mares", event: "foaling", days: 340, emoji: "🐴", from_label: "bred" },
  { species: "Rabbits", event: "kindling", days: 31, emoji: "🐰", from_label: "bred" },
  { species: "Hen eggs", event: "hatch", days: 21, emoji: "🐣", from_label: "set" },
  { species: "Duck eggs", event: "hatch", days: 28, emoji: "🦆", from_label: "set" },
  { species: "Turkey eggs", event: "hatch", days: 28, emoji: "🦃", from_label: "set" },
  { species: "Goose eggs", event: "hatch", days: 30, emoji: "🪿", from_label: "set" },
  { species: "Pullets", event: "point of lay", days: 140, emoji: "🐔", from_label: "hatched" },
  { species: "Broilers", event: "processing weight", days: 56, emoji: "🍗", from_label: "hatched" },
  { species: "Lambs", event: "weaning", days: 60, emoji: "🐑", from_label: "born" },
  { species: "Calves", event: "weaning", days: 205, emoji: "🐄", from_label: "born" },
];

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
  } else if (input.driver === "interval") {
    if (!Number.isFinite(input.days) || input.days! <= 0 || input.days! > 1000)
      return "An interval needs a realistic number of days.";
    if (!input.from || Number.isNaN(Date.parse(input.from)))
      return "An interval needs the date it counts from.";
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

// ── The record ───────────────────────────────────────────────────────────

import type { ItemCodec } from "./blockItems";
import type { ItemRow } from "./mcp";

export const wildlifeCodec: ItemCodec<SavedWildlife> = {
  from: (r: ItemRow): SavedWildlife => ({
    ...(r as unknown as SavedWildlife),
    id: String(r.item_id),
    regionId: String(r.block_id ?? ""),
  }),
  to: (w: SavedWildlife) => {
    const { id, regionId: _r, ...rest } = w;
    return { ...(id ? { item_id: id } : {}), ...rest };
  },
};
