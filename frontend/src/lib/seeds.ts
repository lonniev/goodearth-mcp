// Seed lots — what the grower holds seed of, and what each packet says.
//
// Days to maturity and germination are the packet's figures, or the grower's
// own test; nothing here looks them up or supplies them. A lot is recorded on
// a plot like everything else, belongs to no season — last year's packet is
// still on the shelf — and sits beside its crop in the Sowing table.
//
// Validates the way `block_store._check_seed` does, so a grower is corrected
// in the form rather than by a failed paid call.

import type { ItemCodec } from "./blockItems";
import type { ItemRow } from "./mcp";
import type { RepeatDraft } from "./rotation.ts";
import { baseName } from "./successions.ts";
import { newItemId } from "./submit.ts";

export interface SeedLot {
  id: string;
  crop: string;
  variety?: string;
  /// The plant, when the crop matches one on the ledger.
  taxonId?: number;
  daysToMaturity?: number;
  germinationPct?: number;
  /// When that germination was measured — on the packet or at home.
  testedOn?: string;
  /// The season the packet was packed for.
  packedFor?: number;
  quantity?: number;
  unit?: string;
  source?: string;
  lot?: string;
}

/// What the form hands over: text, as typed.
export interface SeedInput {
  crop: string;
  variety?: string;
  daysToMaturity?: string;
  germinationPct?: string;
  testedOn?: string;
  packedFor?: string;
  quantity?: string;
  unit?: string;
  source?: string;
  lot?: string;
  taxonId?: number;
}

/// The server's bounds, in its words. A bound on what a figure can mean,
/// never on how much seed a grower may hold.
const RANGE = {
  daysToMaturity: [1, 730, "Days to maturity should be between 1 and 730."],
  germinationPct: [0, 100, "Germination is a percentage, 0 to 100."],
  packedFor: [1900, 2200, "The packet year should be a year, like 2026."],
} as const;

function figure(text: string | undefined): number | undefined | null {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function makeSeedLot(i: SeedInput, id?: string): SeedLot | string {
  const crop = i.crop.trim();
  if (!crop) return "Name the crop this is seed of.";
  const out: SeedLot = { id: id ?? newItemId("se"), crop };
  for (const key of ["daysToMaturity", "germinationPct", "packedFor"] as const) {
    const n = figure(i[key]);
    const [lo, hi, msg] = RANGE[key];
    if (n === null || (n !== undefined && (n < lo || n > hi))) return msg;
    if (n !== undefined) out[key] = n;
  }
  const q = figure(i.quantity);
  if (q === null || (q !== undefined && q < 0)) return "How much you have is a number, 0 or more.";
  if (q !== undefined) out.quantity = q;
  const tested = (i.testedOn ?? "").trim();
  if (tested) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tested) || Number.isNaN(Date.parse(tested)))
      return "The test date must be YYYY-MM-DD.";
    out.testedOn = tested;
  }
  for (const key of ["variety", "unit", "source", "lot"] as const) {
    const t = (i[key] ?? "").trim();
    if (t) out[key] = t.slice(0, 120);
  }
  if (i.taxonId) out.taxonId = i.taxonId;
  return out;
}

const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v));
const str = (v: unknown) => (v == null || v === "" ? undefined : String(v));

export const seedCodec: ItemCodec<SeedLot> = {
  from: (r: ItemRow): SeedLot => ({
    id: String(r.item_id),
    crop: String(r.crop ?? ""),
    variety: str(r.variety),
    taxonId: num(r.taxon_id),
    daysToMaturity: num(r.days_to_maturity),
    germinationPct: num(r.germination_pct),
    testedOn: str(r.tested_on),
    packedFor: num(r.packed_for),
    quantity: num(r.quantity),
    unit: str(r.unit),
    source: str(r.source_name),
    lot: str(r.lot),
  }),
  to: (s: SeedLot) => {
    const out: Record<string, unknown> = { ...(s.id ? { item_id: s.id } : {}), crop: s.crop };
    const put = (k: string, v: unknown) => { if (v !== undefined && v !== "") out[k] = v; };
    put("variety", s.variety);
    put("taxon_id", s.taxonId);
    put("days_to_maturity", s.daysToMaturity);
    put("germination_pct", s.germinationPct);
    put("tested_on", s.testedOn);
    put("packed_for", s.packedFor);
    put("quantity", s.quantity);
    put("unit", s.unit);
    // Not `source`: the record keeps its own `source` column for where a row
    // came from, and a seed house's name there would read as that.
    put("source_name", s.source);
    put("lot", s.lot);
    return out;
  },
};

const fold = (s: string) => baseName(s).trim().replace(/\s+/g, " ").toLowerCase();

/// The lots that are seed of this crop: the same plant when both know it,
/// otherwise the same name. A succession is its crop — "Zinnia · succession 3"
/// sows from the zinnia packet.
export function lotsFor(crop: string, taxonId: number | undefined, lots: readonly SeedLot[]): SeedLot[] {
  const name = fold(crop);
  return lots.filter((l) =>
    taxonId && l.taxonId ? l.taxonId === taxonId : fold(l.crop) === name);
}

const month = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

/// A lot, in one line of what its packet says.
export function lotLine(l: SeedLot): string {
  return [
    l.variety,
    l.daysToMaturity != null && `${l.daysToMaturity} days`,
    l.germinationPct != null
      && `${l.germinationPct}% germination${l.testedOn ? ` (tested ${month(l.testedOn)})` : ""}`,
    l.packedFor != null && `packed for ${l.packedFor}`,
  ].filter(Boolean).join(" · ");
}

/// Putting the plant a packet is seed of onto the ledger: the same add-form
/// draft a Rotation tap makes, so a packet and a past planting reach the
/// ledger by one road.
///
/// Reached only for a packet whose plant the ledger does NOT hold — that is
/// what strands it — so there is no row here to carry figures from. The
/// variety becomes the grower's own name for it: "Benary's Giant Mix" is how
/// they will find it again. The packet's days to maturity do NOT become a
/// heat target: days assume an average year and a target counts this ground's
/// own warmth, so converting one to the other would be inventing a figure.
export function draftFromLot(lot: SeedLot): RepeatDraft {
  return {
    label: lot.variety ?? "",
    frostHardy: false,
    taps: false,
    ...(lot.taxonId ? { taxonId: lot.taxonId } : {}),
    searchFor: lot.crop,
  };
}

/// How much is on hand, in the grower's unit.
export function onHand(l: SeedLot): string {
  if (l.quantity == null) return "";
  return `${l.quantity.toLocaleString()}${l.unit ? ` ${l.unit}` : ""}`;
}
