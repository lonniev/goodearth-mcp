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

import { newItemId } from "./submit.ts";
import type { MoonPhase, WildlifeEventInput } from "./mcp";
import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";

/// The moon's principal phases, as the server names them.
export const MOON_PHASES: readonly MoonPhase[] = ["new", "first_quarter", "full", "last_quarter"];

/// A phase in words: "first quarter". The phase itself is the server's name.
export function phaseWord(phase: string): string {
  return (MOON_PHASES as readonly string[]).includes(phase)
    ? tr(`lib.wildlifeModels.phase.${phase}` as MessageKey)
    : phase.replace("_", " ");
}

export interface SavedWildlife extends WildlifeEventInput {
  id: string;
  regionId: string;
  /// The reference, when the row came from the finder rather than from a
  /// typed name. USA-NPN is keyed on the binomial, so without it a creature
  /// has no year to look up.
  taxon_id?: number;
  scientific_name?: string;
}

// The starter events that used to live here are gone. Twenty-two species
// chosen to demonstrate three clocks is not the fauna of anyone's farm — the
// owls, bats and coyotes a grower actually hears were never in it. The
// Wildlife page now reads what iNaturalist records around the region — see
// `wildlifeCatalog` in lib/mcp.

/// What each clock is, read from `lib.wildlifeModels.driver.<clock>` when shown.
export const DRIVER_HELP: Record<string, string> = {
  get heat() { return tr("lib.wildlifeModels.driver.heat"); },
  get daylight() { return tr("lib.wildlifeModels.driver.daylight"); },
  get interval() { return tr("lib.wildlifeModels.driver.interval"); },
  get calendar() { return tr("lib.wildlifeModels.driver.calendar"); },
  get moon() { return tr("lib.wildlifeModels.driver.moon"); },
};

// ── No table of animals ──────────────────────────────────────────────────
//
// There was one: fourteen rows pairing a species with a day count — ewe 147,
// cow 283, hen egg 21. It capped the feature to the livestock somebody had
// thought of, and the figures are breed-dependent, which the note under it
// admitted by telling growers to edit them.
//
// Good Earth does the arithmetic instead. The grower names the animal from
// the same catalogue everything else is named from, says how many days, and
// picks the day it started. Counting forward is the part this service is
// actually good for; knowing that a particular ewe carries 147 days is the
// part the shepherd knows.

/// A creature on the roster, named and not yet dated.
///
/// `makeWildlife` demands an event before it looks at a driver, and every
/// driver demands its figure — so a grower could not simply say "barred owls
/// are here". The reader has always allowed it: `ledgerFlags` skips a row with
/// no driver on purpose, with a test covering it. Supported downstream,
/// unreachable from the form.
export function makeRoster(
  species: string, regionId: string,
  extra?: { taxonId?: number; scientificName?: string },
): SavedWildlife | string {
  if (!species.trim()) return tr("lib.wildlifeModels.which");
  return {
    id: newItemId("wl"),
    species: species.trim(), event: "", regionId,
    ...(extra?.taxonId ? { taxon_id: extra.taxonId } : {}),
    ...(extra?.scientificName ? { scientific_name: extra.scientificName } : {}),
  } as SavedWildlife;
}

/// Validate the way the server does, so the grower is corrected in the form.
export function makeWildlife(
  input: WildlifeEventInput, regionId: string,
): SavedWildlife | string {
  if (!input.species?.trim()) return tr("lib.wildlifeModels.which");
  if (!input.event?.trim()) return tr("lib.wildlifeModels.what");
  if (input.driver === "heat") {
    if (!Number.isFinite(input.gdd) || input.gdd! <= 0 || input.gdd! > 20_000)
      return tr("lib.wildlifeModels.needGdd");
    if (input.base_temp != null && (input.base_temp < 20 || input.base_temp > 80))
      return tr("lib.wildlifeModels.badBase");
  } else if (input.driver === "daylight") {
    if (!Number.isFinite(input.daylight_hours) || input.daylight_hours! <= 0 || input.daylight_hours! >= 24)
      return tr("lib.wildlifeModels.needHours");
  } else if (input.driver === "interval") {
    if (!Number.isFinite(input.days) || input.days! <= 0 || input.days! > 1000)
      return tr("lib.wildlifeModels.needDays");
    if (!input.from || Number.isNaN(Date.parse(input.from)))
      return tr("lib.wildlifeModels.needFrom");
  } else if (input.driver === "condition") {
    const t = input.trigger;
    if (!t || (t.min_night_f == null && t.min_day_f == null && !t.wet))
      return tr("lib.wildlifeModels.needTrigger");
  } else if (input.driver === "moon") {
    if (!input.phase || !MOON_PHASES.includes(input.phase))
      return tr("lib.wildlifeModels.needPhase");
    if (input.after != null && !/^\d{2}-\d{2}$/.test(input.after))
      return tr("lib.wildlifeModels.badAfter");
    if (input.nth != null && ![1, 2, 3].includes(input.nth))
      return tr("lib.wildlifeModels.badNth");
  } else {
    if (!/^\d{2}-\d{2}$/.test(input.typical_on ?? ""))
      return tr("lib.wildlifeModels.needDate");
  }
  return {
    ...input,
    species: input.species.trim(),
    event: input.event.trim(),
    id: newItemId("wl"),
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
