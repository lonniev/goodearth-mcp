// A plant's family, from iNaturalist — the one fact rotation is read by.
//
// Asked of the same catalogue the plant picker already uses, for the taxon ids
// the plantings already carry, so nothing new is stored and no new service is
// relied on. A crop the grower typed without picking a species has no taxon,
// and rotation names it without a family rather than guessing one from a word.

import type { Family } from "./rotation.ts";

const TAXA = "https://api.inaturalist.org/v1/taxa";
const known = new Map<number, Family | null>();

const named = (t: Record<string, unknown>): Family => ({
  name: String(t.name),
  ...(t.preferred_common_name ? { common: String(t.preferred_common_name) } : {}),
});

/// The family a taxon belongs to: its ancestor ranked "family", or itself when
/// it IS a family. Nothing for a taxon above that rank.
export function familyFromTaxon(t: Record<string, unknown>): Family | null {
  if (t.rank === "family") return named(t);
  const ancestors = (t.ancestors as Record<string, unknown>[] | undefined) ?? [];
  const fam = ancestors.find((a) => a.rank === "family");
  return fam ? named(fam) : null;
}

/// Families for several taxa at once — one request per thirty, remembered.
export async function familiesFor(ids: number[], signal?: AbortSignal): Promise<Map<number, Family>> {
  const out = new Map<number, Family>();
  const missing: number[] = [];
  for (const id of new Set(ids.filter((n) => Number.isFinite(n) && n > 0))) {
    const f = known.get(id);
    if (f) out.set(id, f);
    else if (!known.has(id)) missing.push(id);
  }
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30);
    try {
      const r = await fetch(`${TAXA}/${chunk.join(",")}`, { signal, headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { results?: Record<string, unknown>[] };
      const seen = new Set<number>();
      for (const t of d.results ?? []) {
        const id = Number(t.id);
        const f = familyFromTaxon(t);
        known.set(id, f);
        if (f) out.set(id, f);
        seen.add(id);
      }
      for (const id of chunk) if (!seen.has(id)) known.set(id, null);
    } catch {
      // A family the catalogue will not give just now leaves that crop
      // unplaced; the rest of the rotation still reads.
    }
  }
  return out;
}
