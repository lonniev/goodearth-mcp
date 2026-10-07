// Companions, as the ledger reads them.
//
// The service answers in rows that each say WHERE they came from (this plot,
// grown before, an example) and WHY (a rule with its basis, or the colour
// wheel). This file groups and labels; it decides nothing about plants.

import type { Chosen } from "./basket.ts";

/// The eight hues the wheel knows. The service refuses any other.
export const HUES = ["red", "orange", "yellow", "green", "blue", "violet", "pink", "white"] as const;
export type Hue = (typeof HUES)[number];

/// One mark a hue, so a row reads at a glance without a word.
export const HUE_GLYPH: Record<Hue, string> = {
  red: "🔴", orange: "🟠", yellow: "🟡", green: "🟢", blue: "🔵", violet: "🟣", pink: "🩷", white: "⚪",
};

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type Kind = "synergy" | "design";
export type Where = "this_plot" | "grown_before" | "example";

export interface CompanionRow {
  name: string;
  scientific_name?: string | null;
  taxon_id?: number | null;
  where: Where;
  ref?: string | null;
  block?: string | null;
  relation: string;
  why: string;
  basis: "mechanism" | "tradition" | "grower";
  cite: string;
  // synergy
  family?: string | null;
  genus?: string | null;
  // design
  color?: Hue;
  band?: "front" | "mid" | "back" | null;
  layers?: boolean | null;
  bloom_overlap?: number[] | null;
}

export interface CompanionsResult {
  success: boolean;
  error?: string;
  error_code?: string;
  missing?: string[];
  kind?: Kind;
  subject?: { ref?: string; name: string; family?: string | null; genus?: string | null; color?: Hue; band?: string | null };
  companions?: CompanionRow[];
  unplaced?: { name: string; ref?: string | null; where: Where; reason: string }[];
  summary?: string;
  note?: string;
}

/// How a relation reads: one glyph, a tone, a short word for the title.
export const RELATION: Record<string, { glyph: string; tone: string; label: string }> = {
  helped_by:     { glyph: "🤝", tone: "border-growth/50 bg-growth/8", label: "helps this" },
  helps:         { glyph: "🤝", tone: "border-growth/50 bg-growth/8", label: "this helps it" },
  avoid:         { glyph: "⛔", tone: "border-clay/40 bg-clay/8",     label: "keep apart" },
  watch:         { glyph: "👀", tone: "border-honey/50 bg-honey/8",   label: "same family" },
  complementary: { glyph: "🎨", tone: "border-growth/50 bg-growth/8", label: "complementary" },
  analogous:     { glyph: "🎨", tone: "border-honey/50 bg-honey/8",   label: "analogous" },
  foil:          { glyph: "🎨", tone: "border-rule bg-band",          label: "a foil" },
  other:         { glyph: "🎨", tone: "border-rule bg-band",          label: "neither" },
  same:          { glyph: "🎨", tone: "border-rule bg-band",          label: "the same colour" },
};

export const WHERE_LABEL: Record<Where, string> = {
  this_plot: "On this plot", grown_before: "Grown before", example: "Examples",
};

/// Rows in the order the service ranked them, split by where they came from.
export function groupByWhere(rows: CompanionRow[]): { where: Where; rows: CompanionRow[] }[] {
  const order: Where[] = ["this_plot", "grown_before", "example"];
  return order
    .map((where) => ({ where, rows: rows.filter((r) => r.where === where) }))
    .filter((g) => g.rows.length > 0);
}

/// A tapped row as something the planting form can take: a Chosen when the
/// service knew its taxon, else null — the form then searches by name.
export function toChosen(row: CompanionRow): Chosen | null {
  if (!row.taxon_id) return null;
  return { taxonId: row.taxon_id, name: row.name, scientificName: row.scientific_name ?? undefined };
}

/// The name to search for when a row carries no taxon: the binomial when
/// there is one, since that is what the picker is keyed on.
export function searchFor(row: CompanionRow): string {
  return row.scientific_name || row.name;
}

/// Month numbers from `from` to `to` inclusive, wrapping the year: Nov→Feb is
/// [11, 12, 1, 2]. Either missing → none; a single month when they are equal.
export function monthsBetween(from: number, to: number): number[] {
  if (!(from >= 1 && from <= 12 && to >= 1 && to <= 12)) return [];
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to || out.length === 12) break;
  }
  return out;
}

/// The grower's months as a span, for the row: "Jul–Sep", or "Nov–Feb".
export function monthSpan(months: number[] | undefined): string {
  if (!months?.length) return "";
  if (months.length === 1) return MONTHS[months[0] - 1];
  return `${MONTHS[months[0] - 1]}–${MONTHS[months[months.length - 1] - 1]}`;
}
