// Narrowing the ledger to the rows a question is about.
//
// Four questions a grower asks of a long list: what finishes before frost,
// what I hold seed for, what lands in the next fortnight, and what is nearly
// there. Each is a plain predicate over a row the page already has, so none of
// them costs a call and all of them can be tested without a browser.
//
// **A filter answers only over rows that were computed.** Heat status is
// worked out for the rows the ledger was SENT, so filtering a page of twenty
// would answer "among the first twenty" while the pager beneath went on
// counting the whole block. The page's job is to read the block in one go
// while a filter is on; this file's job is to be honest about what it was
// handed.

import type { LedgerRow } from "../components/CropLedger";

export interface LedgerFilter {
  /// Rows the heat says reach their target before the median first frost.
  readyBeforeFrost: boolean;
  /// Rows this grower holds a packet for.
  hasSeed: boolean;
  /// Rows projected to hit their target within this many days. Blank is off.
  withinDays: string;
  /// Rows with no more than this much heat left to bank. Blank is off.
  gddUnder: string;
}

export const NO_FILTER: LedgerFilter = {
  readyBeforeFrost: false, hasSeed: false, withinDays: "", gddUnder: "",
};

/// Whether anything is actually narrowing the list.
///
/// A number that will not parse is not a filter — it is a half-typed one, and
/// hiding rows on the strength of "1" while someone reaches for the "4" is
/// how a list appears to lose things.
export function isOn(f: LedgerFilter): boolean {
  return f.readyBeforeFrost || f.hasSeed
    || num(f.withinDays) != null || num(f.gddUnder) != null;
}

function num(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/// Days from today until `iso`, or null if it is not a date.
function daysOut(iso: string | null | undefined, today: Date): number | null {
  if (!iso) return null;
  // Noon, so a timezone west of UTC cannot turn today's date into yesterday.
  const then = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const from = new Date(`${today.toLocaleDateString("en-CA")}T12:00:00`);
  return Math.round((then.getTime() - from.getTime()) / 86_400_000);
}

/// Does this row answer the question the filter is asking?
///
/// A row the server could not evaluate — no set-out, no target, a perennial —
/// has no projected date and no heat remaining. It is not "no" to these
/// questions, it is "not asked", so every heat filter drops it rather than
/// claiming it failed.
export function matches(
  row: LedgerRow, f: LedgerFilter, hasSeedFor: (row: LedgerRow) => boolean,
  today = new Date(),
): boolean {
  if (f.readyBeforeFrost) {
    const v = row.status?.finish?.verdict;
    if (v !== "finishes" && v !== "finished") return false;
  }
  if (f.hasSeed && !hasSeedFor(row)) return false;

  const within = num(f.withinDays);
  if (within != null) {
    const d = daysOut(row.status?.projected_date, today);
    // Already past its target is within any number of days ahead: the heat
    // arrived, which is the thing being asked about.
    const past = row.status?.state === "past_target";
    if (!past && (d == null || d < 0 || d > within)) return false;
  }

  const under = num(f.gddUnder);
  if (under != null) {
    const left = row.status?.gdd_remaining;
    if (left == null || left > under) return false;
  }
  return true;
}

export function apply(
  rows: readonly LedgerRow[], f: LedgerFilter,
  hasSeedFor: (row: LedgerRow) => boolean, today = new Date(),
): LedgerRow[] {
  if (!isOn(f)) return [...rows];
  return rows.filter((r) => matches(r, f, hasSeedFor, today));
}

/// What is on, in as few words as fit beside a mark.
export function summarise(f: LedgerFilter): string {
  const on: string[] = [];
  if (f.readyBeforeFrost) on.push("before frost");
  if (f.hasSeed) on.push("has seed");
  const w = num(f.withinDays);
  if (w != null) on.push(`≤ ${w}d`);
  const g = num(f.gddUnder);
  if (g != null) on.push(`≤ ${g} GDD`);
  return on.join(" · ");
}
