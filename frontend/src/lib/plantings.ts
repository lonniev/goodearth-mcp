// The block's plantings.
//
// A planting is a crop, a target, and the day it went out. Like regions, these
// belong on Nostr as NIP-78 `goodearth/crops` events; localStorage is the
// offline cache in that design and is what ships first. Keeping the store
// behind this module means the write-through is one file later, not a sweep.

export interface Planting {
  id: string;
  crop: string;
  /// Growing degree days from set-out to the stage the grower cares about.
  gddTarget?: number;
  setOut: string; // YYYY-MM-DD
  /// Per-crop override; blank means the block's default.
  baseTempF?: number;
  /// A perennial: also judged on whether it survives the winter here and gets
  /// its chill. Not instead — a perennial may carry a heat target too, when
  /// the target is a within-season event like a cutting.
  perennial?: boolean;
  /// Chill hours the cultivar needs, and the temperature it is lost at. Both
  /// are the grower's own figures from the nursery tag — Good Earth computes
  /// what this ground delivered against them.
  chillHours?: number;
  hardyToF?: number;
  /// Which saved region this planting is on.
  regionId: string;

  // ── The reference ──────────────────────────────────────────────────────
  //
  // What the grower picked, as a pointer into a catalogue somebody else keeps
  // current rather than a row copied out of one. `taxonId` is iNaturalist's;
  // the binomial is what USA-NPN and USDA PLANTS are keyed on, since neither
  // has a row for "Maple · sugar".
  //
  // Optional throughout, because rows saved before the picker existed carry
  // only a typed name and must keep working.
  taxonId?: number;
  scientificName?: string;
  commonName?: string;

  /// Whether the grower taps this for sap. Nobody upstream knows — a sugar
  /// maple in a hedgerow is not a sugarbush — so it is theirs to say.
  taps?: boolean;

  /// Survives a light frost, so it can use the shoulders of the season. Moves
  /// the earliest out-date; a seed-packet fact, and therefore the grower's.
  frostHardy?: boolean;
}

// ── There is no crop library ─────────────────────────────────────────────
//
// There was one: 146 plants with their heat targets, chill hours and cold
// limits typed into this file. It capped what a grower could plant to what one
// afternoon of research had thought of, and every figure in it was a claim
// this service was in no position to make.
//
// A plant is now named by searching iNaturalist (`components/SpeciesPicker`)
// and identified by the taxon id that comes back. The agronomy that used to
// ride along with the name comes from where it always should have: USDA PLANTS
// where it is published, and the grower's own seed packet where it is not.

/// Validate the way the server does, so a grower is corrected in the form
/// rather than by a failed paid call.
///
/// A heat target and a set-out date are required of an ANNUAL and optional of
/// a perennial. `crops.validate_planting` has always allowed the absence — it
/// returns a presence row rather than raising — but this refused it, so the
/// only way to record a tree was to save an annual and then edit both fields
/// back out. An apple planted in 2019 has no set-out this season and no target
/// anyone counts, and both of those are true things to record.
export function makePlanting(
  crop: string,
  gddTarget: number | undefined,
  setOut: string,
  regionId: string,
  baseTempF?: number,
  extra?: Pick<Planting,
    "perennial" | "chillHours" | "hardyToF" | "taxonId" | "scientificName"
    | "commonName" | "taps" | "frostHardy">,
): Planting | string {
  if (!crop.trim()) return "Give the planting a crop name.";
  const perennial = !!extra?.perennial;

  if (gddTarget != null && (!Number.isFinite(gddTarget) || gddTarget < 1 || gddTarget > 20_000))
    return "GDD target should be a realistic number of degree days.";
  if (!perennial && gddTarget == null)
    return "GDD target should be a realistic number of degree days.";

  if (setOut && (!/^\d{4}-\d{2}-\d{2}$/.test(setOut) || Number.isNaN(Date.parse(setOut))))
    return "Set-out date must be YYYY-MM-DD.";
  if (!perennial && !setOut) return "Set-out date must be YYYY-MM-DD.";

  if (baseTempF != null && (baseTempF < 20 || baseTempF > 80))
    return "Base temperature must be between 20 and 80 °F.";
  if (extra?.chillHours != null && (extra.chillHours < 0 || extra.chillHours > 2_000))
    return "Chill hours should be between 0 and 2,000.";
  if (extra?.hardyToF != null && (extra.hardyToF < -60 || extra.hardyToF > 40))
    return "Hardiness should be between -60 and 40 °F.";

  return {
    id: `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    crop: crop.trim(), setOut, regionId,
    ...(gddTarget != null ? { gddTarget } : {}),
    ...(baseTempF != null ? { baseTempF } : {}),
    ...(perennial ? { perennial: true } : {}),
    ...(extra?.chillHours != null ? { chillHours: extra.chillHours } : {}),
    ...(extra?.hardyToF != null ? { hardyToF: extra.hardyToF } : {}),
    ...(extra?.taxonId ? { taxonId: extra.taxonId } : {}),
    ...(extra?.scientificName ? { scientificName: extra.scientificName } : {}),
    ...(extra?.commonName ? { commonName: extra.commonName } : {}),
    ...(extra?.taps ? { taps: true } : {}),
    ...(extra?.frostHardy ? { frostHardy: true } : {}),
  };
}

/// A plant with no picture still needs something in the row.
///
/// This used to search the 146-name catalogue for the longest name contained
/// in what the grower typed. With the catalogue gone there is nothing to match
/// against and nothing to guess with, which is the honest state: the row shows
/// iNaturalist's own photograph of the taxon when it has one, and a seedling
/// when it does not.
export const SEEDLING = "\u{1F331}";

/// The date a planting added from a sowing row should carry.
///
/// The row's whole point is its out date, so that is the date to use — but
/// only while it is still ahead. A window that opened in April cannot be when
/// an August tap put the crop in the ground, and dating it there would
/// backdate the heat the ledger goes on to count against the target. Both
/// arguments are YYYY-MM-DD, which compares correctly as text.
export function plantingDateFor(earliestOut: string | null | undefined, today: string): string {
  return earliestOut && earliestOut > today ? earliestOut : today;
}

// ── The record ───────────────────────────────────────────────────────────
//
// Plantings live on the block now, not in this browser. The codec is the only
// place that knows how a Planting maps onto a stored item, so the views keep
// working in their own shape.

import type { ItemCodec } from "./blockItems";
import type { ItemRow } from "./mcp";

export const plantingCodec: ItemCodec<Planting> = {
  from: (r: ItemRow): Planting => ({
    id: String(r.item_id),
    crop: String(r.crop ?? ""),
    // Never fabricate a target. A missing one meant 0 here, which the server
    // then rejected as "outside any real crop's range" — and one such row took
    // the whole ledger down. Absent stays absent.
    gddTarget: r.gdd_target == null ? undefined : Number(r.gdd_target),
    // A presence row has no set-out: the crop grows here and when it went in
    // is not known. Empty string rather than a fabricated date.
    setOut: String(r.set_out ?? ""),
    baseTempF: r.base_temp == null ? undefined : Number(r.base_temp),
    // A perennial is inferred from what it carries, not from a flag alone, so
    // a tree saved through the MCP by an agent that knew only its chill figure
    // still reads back as one.
    perennial: r.perennial === true || r.chill_hours != null || r.hardy_to_f != null
      ? true : undefined,
    chillHours: r.chill_hours == null ? undefined : Number(r.chill_hours),
    hardyToF: r.hardy_to_f == null ? undefined : Number(r.hardy_to_f),
    regionId: String(r.block_id ?? ""),
    taxonId: r.taxon_id == null ? undefined : Number(r.taxon_id),
    scientificName: r.scientific_name ? String(r.scientific_name) : undefined,
    commonName: r.common_name ? String(r.common_name) : undefined,
    taps: r.taps === true ? true : undefined,
    frostHardy: r.frost_hardy === true ? true : undefined,
  }),
  to: (p: Planting) => ({
    ...(p.id ? { item_id: p.id } : {}),
    crop: p.crop,
    ...(p.gddTarget != null ? { gdd_target: p.gddTarget } : {}),
    ...(p.setOut ? { set_out: p.setOut } : {}),
    ...(p.baseTempF != null ? { base_temp: p.baseTempF } : {}),
    ...(p.perennial ? { perennial: true } : {}),
    ...(p.chillHours != null ? { chill_hours: p.chillHours } : {}),
    ...(p.hardyToF != null ? { hardy_to_f: p.hardyToF } : {}),
    ...(p.taxonId ? { taxon_id: p.taxonId } : {}),
    ...(p.scientificName ? { scientific_name: p.scientificName } : {}),
    ...(p.commonName ? { common_name: p.commonName } : {}),
    ...(p.taps ? { taps: true } : {}),
    ...(p.frostHardy ? { frost_hardy: true } : {}),
  }),
};
