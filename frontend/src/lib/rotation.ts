// Rotation — what grew on this ground, season by season, by plant family.
//
// Stated as fact, never as advice. "Brassicaceae here in 2025 and 2026" is what
// the record says; what goes there next is the grower's to decide, and
// rotation and companion rules are published agronomy this service does not
// publish.
//
// Read from every planting on the plot, the ones since removed from the
// ledger included — a bed cleared in October is exactly the history rotation
// is about. A succession is its crop: six sowings of zinnia are one zinnia.

import type { ItemRow } from "./mcp";
import { plantingCodec, type Planting } from "./plantings.ts";
import { baseName } from "./successions.ts";

export interface Family {
  name: string;
  common?: string;
}

export interface RotationPlanting {
  crop: string;
  /// The season it grew in: its set-out year, or the season the record filed
  /// it under when it has no set-out.
  season: number | null;
  taxonId?: number;
  /// The whole record, so a tap can put the same plant back on the ledger
  /// with the figures the grower gave it last time.
  planting?: Planting;
}

export interface FamilyGroup {
  family: string;
  common?: string;
  crops: string[];
  /// The other seasons this family grew here, newest first. A fact, not a flag.
  alsoIn: number[];
}

export interface SeasonRow {
  season: number;
  families: FamilyGroup[];
  /// Crops the record names without a species to find a family by.
  unplaced: string[];
  /// Each crop that season, as its newest planting — what a tap plants again.
  repeat: Record<string, RotationPlanting>;
}

export function fromRow(r: ItemRow): RotationPlanting {
  const setOut = String(r.set_out ?? "");
  const filed = r.season_year == null ? null : Number(r.season_year);
  return {
    crop: baseName(String(r.crop ?? "")),
    season: /^\d{4}-/.test(setOut) ? Number(setOut.slice(0, 4)) : filed,
    ...(r.taxon_id != null ? { taxonId: Number(r.taxon_id) } : {}),
    planting: plantingCodec.from(r),
  };
}

/// What the add form starts from when a crop is planted again.
export interface RepeatDraft {
  /// The grower's own name for it, when it is not simply the plant's name.
  label: string;
  gddTargetF?: number;
  baseTempF?: number;
  frostHardy: boolean;
  taps: boolean;
  taxonId?: number;
  scientificName?: string;
  commonName?: string;
  /// What to search the picker for when the record names no species.
  searchFor: string;
}

/// A past planting as the start of a new one. The figures the grower gave it
/// carry over; the day it goes in does not — that is this season's choice. A
/// succession's number is dropped too: planting zinnia again is a new zinnia,
/// not "succession 3" of last year's.
export function repeatDraft(p: RotationPlanting): RepeatDraft {
  const pl = p.planting;
  const named = baseName(pl?.crop ?? p.crop);
  const plantName = [pl?.commonName, pl?.scientificName].filter(Boolean);
  return {
    label: plantName.includes(named) ? "" : named,
    ...(pl?.gddTarget != null ? { gddTargetF: pl.gddTarget } : {}),
    ...(pl?.baseTempF != null ? { baseTempF: pl.baseTempF } : {}),
    frostHardy: !!pl?.frostHardy,
    taps: !!pl?.taps,
    ...(p.taxonId ? { taxonId: p.taxonId } : {}),
    ...(pl?.scientificName ? { scientificName: pl.scientificName } : {}),
    ...(pl?.commonName ? { commonName: pl.commonName } : {}),
    searchFor: p.crop,
  };
}

export function rotation(plantings: RotationPlanting[], families: Map<number, Family>): SeasonRow[] {
  const bySeason = new Map<number, Map<string, FamilyGroup>>();
  const unplaced = new Map<number, string[]>();
  const seasonsOf = new Map<string, Set<number>>();
  const repeats = new Map<number, Record<string, RotationPlanting>>();

  for (const p of plantings) {
    if (p.season == null || !p.crop) continue;
    // The record is read newest first, so the first of a crop in a season is
    // its latest planting that season.
    const rep = repeats.get(p.season) ?? {};
    if (!rep[p.crop]) rep[p.crop] = p;
    repeats.set(p.season, rep);
    const fam = p.taxonId != null ? families.get(p.taxonId) : undefined;
    if (!fam) {
      const u = unplaced.get(p.season) ?? [];
      if (!u.includes(p.crop)) u.push(p.crop);
      unplaced.set(p.season, u);
      continue;
    }
    const groups = bySeason.get(p.season) ?? new Map<string, FamilyGroup>();
    bySeason.set(p.season, groups);
    const g = groups.get(fam.name) ?? { family: fam.name, common: fam.common, crops: [], alsoIn: [] };
    if (!g.crops.includes(p.crop)) g.crops.push(p.crop);
    groups.set(fam.name, g);
    const seen = seasonsOf.get(fam.name) ?? new Set<number>();
    seen.add(p.season);
    seasonsOf.set(fam.name, seen);
  }

  const seasons = [...new Set([...bySeason.keys(), ...unplaced.keys()])].sort((a, b) => b - a);
  return seasons.map((season) => ({
    season,
    families: [...(bySeason.get(season)?.values() ?? [])]
      .map((g) => ({
        ...g,
        alsoIn: [...(seasonsOf.get(g.family) ?? [])].filter((y) => y !== season).sort((a, b) => b - a),
      }))
      .sort((a, b) => a.family.localeCompare(b.family)),
    unplaced: unplaced.get(season) ?? [],
    repeat: repeats.get(season) ?? {},
  }));
}
