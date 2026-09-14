// Harvests — what a planting actually gave, and when.
//
// The ledger projects when each planting reaches its heat target, and that
// target is usually harvest. Nothing recorded whether it did. A cut is now a
// field observation tagged `harvest`, joined to its planting by `ref`, so it
// sits in Field Reports with everything else seen on the ground.
//
// A planting's FIRST cut is also a measurement: the calibration model reads it
// as the stage the heat target predicted, and enough of them move a generic
// target toward this ground's own. Later cuts of a cut-and-come-again crop are
// yield, not timing, and are only added up.

import type { FieldReport } from "./reports.ts";
import type { Planting } from "./plantings.ts";
import { newItemId } from "./submit.ts";

export const HARVEST = "harvest";

/// Suggestions, not a list to choose from. Flowers go by the stem or the
/// bunch, vegetables by weight or the head; a grower may type anything.
export const UNITS = ["stems", "bunches", "lb", "kg", "heads", "pints", "quarts", "each"];

export interface HarvestInput {
  on: string;
  amount?: number;
  unit?: string;
  note?: string;
}

const isoToday = () => new Date().toLocaleDateString("en-CA");

/// One cut of one planting, or the reason it cannot be one.
///
/// `id` is kept by the form across retries, so a tap repeated after a save
/// that landed but did not answer updates the cut it made instead of adding a
/// second one.
export function makeHarvest(
  p: Planting, regionId: string, h: HarvestInput,
  opts: { id?: string; today?: string } = {},
): FieldReport | string {
  const today = opts.today ?? isoToday();
  if (!h.on || Number.isNaN(Date.parse(h.on))) return "When was it cut?";
  if (h.on > today) return "That day has not come yet.";
  if (p.setOut && h.on < p.setOut) return "It cannot have been cut before it was set out.";
  if (h.amount != null && (!Number.isFinite(h.amount) || h.amount < 0))
    return "How much — as a number?";
  const unit = h.unit?.trim();
  return {
    id: opts.id ?? newItemId("hv"),
    regionId,
    tag: HARVEST,
    observedOn: h.on,
    note: h.note?.trim() ?? "",
    crop: p.crop,
    stage: HARVEST,
    ref: p.id,
    // What the cut is measured against, as the planting stood that day.
    ...(p.gddTarget != null ? { gddTarget: p.gddTarget } : {}),
    ...(p.setOut ? { setOut: p.setOut } : {}),
    ...(h.amount != null ? { amount: h.amount } : {}),
    ...(unit ? { unit } : {}),
    createdAt: new Date().toISOString(),
  };
}

export interface HarvestSummary {
  cuts: number;
  first: string;
  last: string;
  /// Added up per unit. Stems and pounds are not one number.
  totals: { unit: string; amount: number }[];
}

/// Every planting's cuts, by the planting's id. A harvest not joined to a
/// planting is still a field report; it just has no row here to sit on.
export function summarize(reports: FieldReport[]): Map<string, HarvestSummary> {
  const out = new Map<string, HarvestSummary>();
  const sorted = reports
    .filter((r) => r.tag === HARVEST && r.ref)
    .sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  for (const r of sorted) {
    const s = out.get(r.ref!) ?? { cuts: 0, first: r.observedOn, last: r.observedOn, totals: [] };
    s.cuts += 1;
    s.last = r.observedOn;
    if (r.amount != null) {
      const unit = r.unit?.trim() ?? "";
      const t = s.totals.find((x) => x.unit === unit);
      if (t) t.amount += r.amount; else s.totals.push({ unit, amount: r.amount });
    }
    out.set(r.ref!, s);
  }
  return out;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/// "3 cuts · first Aug 12 · 140 stems, 2.5 lb" — or "1 cut · Aug 12 · 40 stems".
export function describeHarvest(s: HarvestSummary, day: (iso: string) => string): string {
  const when = s.cuts === 1 ? day(s.first) : `first ${day(s.first)}`;
  const gave = s.totals.map((t) => `${num(t.amount)}${t.unit ? ` ${t.unit}` : ""}`).join(", ");
  return [`${s.cuts} ${s.cuts === 1 ? "cut" : "cuts"}`, when, gave].filter(Boolean).join(" · ");
}

/// The unit last used for a crop of this name, to offer again. Zinnias cut by
/// the stem in June are cut by the stem in August.
export function lastUnit(reports: FieldReport[], crop: string): string | undefined {
  let best: FieldReport | undefined;
  for (const r of reports) {
    if (r.tag !== HARVEST || !r.unit || r.crop !== crop) continue;
    if (!best || r.observedOn >= best.observedOn) best = r;
  }
  return best?.unit;
}
