// Successions — one crop sown again and again, each sowing its own planting.
//
// A flower farm lives on them: zinnias every two weeks from the last frost to
// the last sowing that still blooms. The planting window works out the dates;
// this turns them into plantings, so each sowing gets its own row on the
// ledger — its own heat, its own projected finish, its own frost verdict.
//
// Named "<crop> · succession N", the convention growers already typed by
// hand, and numbered after any successions the crop already has, so a second
// batch planned in July does not come out as a second "succession 1".

import { makePlanting, type Planting } from "./plantings.ts";
import type { SuccessionRow } from "./mcp";

const SUFFIX = /\s*·\s*succession\s+(\d+)\s*$/i;

/// The crop without any succession number on it.
export function baseName(crop: string): string {
  return crop.replace(SUFFIX, "").trim();
}

export function successionName(crop: string, n: number): string {
  return `${baseName(crop)} · succession ${n}`;
}

/// The succession sowings as plantings, ready for one write.
///
/// Skips a sowing the ledger already has — same crop, same set-out day — so
/// pressing Add twice adds nothing the second time. Only sowings that finish
/// before the frost are offered; the schedule stops at the last one anyway.
export function toPlantings(
  template: Planting, rows: SuccessionRow[], existing: Planting[], regionId: string,
): { made: Planting[]; skipped: number } {
  const base = baseName(template.crop);
  const mine = existing.filter((p) => baseName(p.crop) === base);
  const taken = new Set(mine.map((p) => p.setOut));
  let next = Math.max(0, ...mine.map((p) => Number(SUFFIX.exec(p.crop)?.[1] ?? 0))) + 1;

  const made: Planting[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.verdict !== "finishes") continue;
    if (taken.has(row.out)) { skipped++; continue; }
    const p = makePlanting(
      successionName(base, next), template.gddTarget, row.out, regionId, template.baseTempF,
      {
        taxonId: template.taxonId, scientificName: template.scientificName,
        commonName: template.commonName, taps: template.taps, frostHardy: template.frostHardy,
      },
    );
    if (typeof p === "string") continue;
    made.push(p);
    taken.add(row.out);
    next++;
  }
  return { made, skipped };
}
