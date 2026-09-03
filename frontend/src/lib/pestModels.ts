// The grower's pest models.
//
// These are the patron's own, not Good Earth's. The service computes when a
// model's stages arrive on a given piece of ground; it does not publish
// entomology, because the authoritative thresholds belong to the grower's
// extension service and vary by region and biotype.
//
// The starters below are offered as a shape to edit, and are labelled that way
// everywhere they surface. Stored per-region like plantings; NIP-78
// `goodearth/pests` is where they belong once the write-through lands.

import type { PestModel } from "./mcp";

export interface SavedPest extends PestModel {
  id: string;
  regionId: string;
}

/// Starting shapes only. Every number here must be confirmed against a local
/// extension bulletin before anyone sprays or skips a scouting round — which
/// is why the UI says so next to them rather than in a footnote.
// The starter models that used to live here are gone. Five pests written in
// this file were one author's guess at what a farm cares about, identical for
// a Vermont lakeshore and a Georgia orchard. The Pests page now reads USA-NPN's
// degree-day forecasts for the actual region — see `pestCatalog` in lib/mcp.

/// Validate the way the server does, so the grower is corrected in the form.
export function makePest(
  pest: string, baseTemp: number, stagesRaw: string, regionId: string, biofix?: string,
): SavedPest | string {
  if (!pest.trim()) return "Give the pest a name.";
  if (!Number.isFinite(baseTemp) || baseTemp < 20 || baseTemp > 80)
    return "Base temperature must be between 20 and 80 °F.";
  if (biofix && (!/^\d{4}-\d{2}-\d{2}$/.test(biofix) || Number.isNaN(Date.parse(biofix))))
    return "Biofix must be YYYY-MM-DD, or left empty to count from Jan 1.";

  // "first flight 375, second flight 1400" — one stage per comma.
  const stages = stagesRaw.split(",").map((chunk) => {
    const m = chunk.trim().match(/^(.*?)[\s:]+(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const g = Number(m[2]);
    if (!Number.isFinite(g) || g <= 0 || g > 20_000) return null;
    return { stage: m[1].trim(), gdd: g };
  });
  if (!stages.length || stages.some((s) => s === null))
    return 'Stages look like "first flight 375, second flight 1400".';

  return {
    id: `pe-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    pest: pest.trim(), base_temp: baseTemp, regionId,
    stages: stages as { stage: string; gdd: number }[],
    ...(biofix ? { biofix } : {}),
  };
}

// ── The record ───────────────────────────────────────────────────────────

import type { ItemCodec } from "./blockItems";
import type { ItemRow } from "./mcp";

export const pestCodec: ItemCodec<SavedPest> = {
  from: (r: ItemRow): SavedPest => ({
    ...(r as unknown as SavedPest),
    id: String(r.item_id),
    regionId: String(r.block_id ?? ""),
  }),
  to: (p: SavedPest) => {
    const { id, regionId: _r, ...rest } = p;
    return { ...(id ? { item_id: id } : {}), ...rest };
  },
};
