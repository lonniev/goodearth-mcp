// The Dashboard's one line about water.
//
// "29.5 mm short over 14 days · 1.1 mm rain, 30.6 mm to the air · +3.0 mm in
// the week ahead". The balance first, because it is the answer; the two sums
// after it, because they are why.

import type { WaterBalanceResult } from "./mcp.ts";
import type { Unit } from "./units.ts";

const MM_PER_IN = 25.4;

/// A water depth from millimetres, in the reader's unit.
export function depth(mm: number, unit: Unit): string {
  return unit === "F" ? `${(mm / MM_PER_IN).toFixed(2)} in` : `${mm.toFixed(1)} mm`;
}

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function waterLine(r: WaterBalanceResult, unit: Unit): string {
  const t = r.today;
  const span = days(t.since, t.date);
  const stand = Math.abs(t.balance_mm) < 0.5
    ? `Even over ${span} days`
    : `${depth(Math.abs(t.balance_mm), unit)} ${t.balance_mm < 0 ? "short" : "to spare"} over ${span} days`;
  const parts = [stand, `${depth(t.rain_mm, unit)} rain, ${depth(t.et0_mm, unit)} to the air`];
  const change = r.ahead.balance_change_mm;
  if (r.ahead.until > t.date) {
    parts.push(Math.abs(change) < 0.5
      ? "the week ahead holds it"
      : `${change > 0 ? "+" : "−"}${depth(Math.abs(change), unit)} in the week ahead`);
  }
  return parts.join(" · ");
}

/// Volumetric water as a percentage: 0.215 → "22%".
export function percent(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
