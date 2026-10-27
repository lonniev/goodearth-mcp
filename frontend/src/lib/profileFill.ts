// What picking a plant fills on the planting form.
//
// The server looks the plant up (`plant_profile`) so the grower never has to
// know a degree-day figure, a height or a bloom month. These are the rules for
// putting that answer into the form, kept pure so they can be tested.

import type { PlantProfileResult } from "./mcp";
import { HUES } from "./companions.ts";

/// The form's own field names, and the text each would hold.
export interface Fill {
  target?: string;
  base?: string;
  color?: string;
  height?: string;
  bloom_from?: string;
  bloom_to?: string;
  /// A checkbox: "true" to tick it. Absent leaves it as it is.
  hardy?: string;
}

/// The scale the grower reads in.
interface Scale {
  degreeDays: (ddF: number) => number;
  temp: (f: number) => number;
}

/// A bloom season as a first and last month, across the year's end when it
/// wraps: [1, 2, 12] is December to February, not January to December.
export function bloomSpan(months: number[] | null | undefined): [number, number] | null {
  const m = [...new Set((months ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))]
    .sort((a, b) => a - b);
  if (!m.length) return null;
  // The season starts after the widest gap between flowering months.
  let start = 0, widest = -1;
  for (let i = 0; i < m.length; i++) {
    const next = m[(i + 1) % m.length];
    const gap = (next - m[i] + 12) % 12 || 12;
    if (gap > widest) { widest = gap; start = (i + 1) % m.length; }
  }
  return [m[start], m[(start + m.length - 1) % m.length]];
}

/// The profile, as the text each form field would hold.
export function fillFrom(r: PlantProfileResult, u: Scale): Fill {
  const p = r.profile, here = r.on_this_plot;
  if (!p || !here) return {};
  const out: Fill = {};
  if (here.gdd_target != null) out.target = String(Math.round(u.degreeDays(here.gdd_target)));
  if (here.base_temp_f != null && here.gdd_target != null) out.base = String(Math.round(u.temp(here.base_temp_f)));
  if (p.flower_color && (HUES as readonly string[]).includes(p.flower_color)) out.color = p.flower_color;
  if (p.height_in?.typical != null) out.height = String(Math.round(p.height_in.typical));
  const span = bloomSpan(here.bloom_months);
  if (span) { out.bloom_from = String(span[0]); out.bloom_to = String(span[1]); }
  if (p.frost_hardy) out.hardy = "true";
  return out;
}

/// May the page write into a field? Only when it is empty, or still holds what
/// the page itself wrote last. What the grower entered is theirs, and stays.
export function mayFill(current: string, lastFilled: string | undefined): boolean {
  const t = current.trim();
  return t === "" || t === (lastFilled ?? "");
}

/// Where the figures came from, for the tooltip on what was filled.
export function provenance(r: PlantProfileResult): string {
  const p = r.profile, here = r.on_this_plot;
  if (!p || !here) return "";
  const name = p.common_name || p.scientific_name;
  const dtm = p.days_to_maturity;
  const heat = here.basis === "published"
    ? `GDD as published (base ${here.base_temp_f}°F)`
    : dtm && here.gdd_target != null
      ? `about ${dtm.typical} days (${dtm.low}–${dtm.high}) from ${dtm.counted_from}, in a typical year here (${here.record})`
      : "";
  const sources = (p.sources ?? []).map((s) => s.title).slice(0, 3).join(" · ");
  return [name, heat, sources && `Sources: ${sources}`].filter(Boolean).join(" — ");
}
