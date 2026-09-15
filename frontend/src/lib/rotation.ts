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
}

export function fromRow(r: ItemRow): RotationPlanting {
  const setOut = String(r.set_out ?? "");
  const filed = r.season_year == null ? null : Number(r.season_year);
  return {
    crop: baseName(String(r.crop ?? "")),
    season: /^\d{4}-/.test(setOut) ? Number(setOut.slice(0, 4)) : filed,
    ...(r.taxon_id != null ? { taxonId: Number(r.taxon_id) } : {}),
  };
}

export function rotation(plantings: RotationPlanting[], families: Map<number, Family>): SeasonRow[] {
  const bySeason = new Map<number, Map<string, FamilyGroup>>();
  const unplaced = new Map<number, string[]>();
  const seasonsOf = new Map<string, Set<number>>();

  for (const p of plantings) {
    if (p.season == null || !p.crop) continue;
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
  }));
}
