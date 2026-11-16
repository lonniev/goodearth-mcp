// Companions, as the ledger reads them.
//
// The service answers in rows that each say WHERE they came from (this plot,
// grown before, an example) and WHY (a rule with its basis, or the colour
// wheel). This file groups and labels; it decides nothing about plants.

import type { Chosen } from "./basket.ts";
import { languageLocale } from "@tollbooth-dpyc/web";
import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";

/// The eight hues the wheel knows. The service refuses any other.
export const HUES = ["red", "orange", "yellow", "green", "blue", "violet", "pink", "white"] as const;
export type Hue = (typeof HUES)[number];

/// One mark a hue, so a row reads at a glance without a word.
export const HUE_GLYPH: Record<Hue, string> = {
  red: "🔴", orange: "🟠", yellow: "🟡", green: "🟢", blue: "🔵", violet: "🟣", pink: "🩷", white: "⚪",
};

/// A month's short name in the reader's language: 0 is January.
export function monthShort(i: number): string {
  return new Date(Date.UTC(2000, i, 15)).toLocaleDateString(languageLocale(), { month: "short", timeZone: "UTC" });
}

/// The twelve short month names, "Jan" to "Dec". Each is read in the reader's
/// language when it is looked at, so a list drawn after a language change
/// shows the new names.
export const MONTHS: readonly string[] = Object.defineProperties(new Array<string>(12),
  Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, { get: () => monthShort(i), enumerable: true }])));

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
/// The word is `lib.companions.relation.<relation>`, read when it is shown.
const relation = (key: string, glyph: string, tone: string) =>
  ({ glyph, tone, get label() { return tr(`lib.companions.relation.${key}` as MessageKey); } });

export const RELATION: Record<string, { glyph: string; tone: string; label: string }> = {
  helped_by:     relation("helped_by", "🤝", "border-growth/50 bg-growth/8"),
  helps:         relation("helps", "🤝", "border-growth/50 bg-growth/8"),
  avoid:         relation("avoid", "⛔", "border-clay/40 bg-clay/8"),
  watch:         relation("watch", "👀", "border-honey/50 bg-honey/8"),
  complementary: relation("complementary", "🎨", "border-growth/50 bg-growth/8"),
  analogous:     relation("analogous", "🎨", "border-honey/50 bg-honey/8"),
  foil:          relation("foil", "🎨", "border-rule bg-band"),
  other:         relation("other", "🎨", "border-rule bg-band"),
  same:          relation("same", "🎨", "border-rule bg-band"),
};

export const WHERE_LABEL: Record<Where, string> = {
  get this_plot() { return tr("lib.companions.where.thisPlot"); },
  get grown_before() { return tr("lib.companions.where.grownBefore"); },
  get example() { return tr("lib.companions.where.example"); },
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
