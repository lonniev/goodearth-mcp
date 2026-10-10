// An array laid on a Sun spot, and what it would cost and earn.
//
// The grower draws a footprint in metres; the grid under it says what each
// kW there yields; the operator's live reading of DOE's benchmark and EIA's
// tariff turns that into dollars. All of it is arithmetic over figures that
// arrived with the Sun answer — no call is made as the rectangle moves, and
// no price is written here.
//
// The footprint is GROUND, not module: rows of fixed-tilt panels with the
// spacing that keeps one row from shading the next. The answer says how many
// watts a square metre of ground carries; the app does not.

import { lonScaleAt } from "./geo.ts";
import type { SunlightKwPrices } from "./mcp.ts";
import type { SunGrid } from "./sunGrid.ts";

/// Metres per degree of latitude; longitude scales by `lonScaleAt`.
export const M_PER_DEG_LAT = 111_320;

/// Metres, east–west by north–south.
export interface ArraySize { w: number; l: number }

/// About 25 kW — a farm's own array, and a rectangle a thumb can find on a
/// plot drawn at a few hectares.
export const DEFAULT_ARRAY: ArraySize = { w: 24, l: 12 };
export const MIN_M = 4;
export const MAX_M = 400;

export function clampSize(s: ArraySize): ArraySize {
  const one = (v: number) => Math.min(MAX_M, Math.max(MIN_M, Math.round(Number.isFinite(v) ? v : MIN_M)));
  return { w: one(s.w), l: one(s.l) };
}

export interface Bounds { south: number; west: number; north: number; east: number }

/// The rectangle centred on a spot, in degrees.
export function footprintBounds(centre: { lat: number; lon: number }, size: ArraySize): Bounds {
  const dLat = size.l / 2 / M_PER_DEG_LAT;
  const dLon = (size.w / 2 / M_PER_DEG_LAT) * lonScaleAt(centre.lat);
  return { south: centre.lat - dLat, west: centre.lon - dLon, north: centre.lat + dLat, east: centre.lon + dLon };
}

/// The size that puts a corner where a drag left it, the centre staying put.
export function sizeFromCorner(centre: { lat: number; lon: number }, corner: { lat: number; lon: number }): ArraySize {
  const l = 2 * Math.abs(corner.lat - centre.lat) * M_PER_DEG_LAT;
  const w = (2 * Math.abs(corner.lon - centre.lon) * M_PER_DEG_LAT) / lonScaleAt(centre.lat);
  return clampSize({ w, l });
}

/// Kept-cell indices whose centres lie inside the bounds.
export function cellsUnder(g: SunGrid, b: Bounds): number[] {
  const dLat = (g.bounds.maxLat - g.bounds.minLat) / g.rows;
  const dLon = (g.bounds.maxLon - g.bounds.minLon) / g.cols;
  const out: number[] = [];
  for (let r = 0; r < g.rows; r++) {
    const lat = g.bounds.maxLat - (r + 0.5) * dLat;
    if (lat < b.south || lat > b.north) continue;
    for (let c = 0; c < g.cols; c++) {
      const k = g.kept[r * g.cols + c];
      if (k < 0) continue;
      const lon = g.bounds.minLon + (c + 0.5) * dLon;
      if (lon >= b.west && lon <= b.east) out.push(k);
    }
  }
  return out;
}

/// Mean kWh per kW a year over the cells under the footprint — the spot's
/// own figure when the footprint is smaller than a cell, null when the grid
/// carries no solar figure at all.
export function arrayKwhPerKw(g: SunGrid, b: Bounds, inLeaf: boolean, spot: number): number | null {
  const a = inLeaf ? g.kwhInLeaf : g.kwh;
  if (!a) return null;
  const cells = cellsUnder(g, b);
  if (!cells.length) return spot >= 0 ? a[spot] : null;
  let sum = 0;
  for (const k of cells) sum += a[k];
  return sum / cells.length;
}

export function capacityKw(size: ArraySize, wPerM2: number): number {
  return (size.w * size.l * wPerM2) / 1000;
}

export type Tier = "residential" | "commercial" | "utility";

export function tierFor(kw: number, tiers: SunlightKwPrices["tiers"]): Tier {
  if (kw <= tiers.residential_max_kw) return "residential";
  if (kw <= tiers.commercial_max_kw) return "commercial";
  return "utility";
}

/// What the array costs to put up at the benchmark's $/W for its size, or
/// null when the benchmark was not read.
export function installUsd(kw: number, prices: SunlightKwPrices): number | null {
  if (!prices.install) return null;
  const perW = prices.install[`${tierFor(kw, prices.tiers)}_usd_per_w`];
  return kw * 1000 * perW;
}

export function dailyKwh(kw: number, kwhPerKwYear: number): number {
  return (kw * kwhPerKwYear) / 365;
}

export function dailyIncomeUsd(dailyKwhMade: number, centsPerKwh: number): number {
  return (dailyKwhMade * centsPerKwh) / 100;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/// "2026-07" → "Jul 2026"; anything else as it came.
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const i = Number(m[2]) - 1;
  return i >= 0 && i < 12 ? `${MONTH[i]} ${m[1]}` : period;
}

export interface SellRate { cents: number; label: string; yours: boolean }

/// The rate a kWh sells at: the grower's own if they typed one, else the
/// state's retail price as read, else nothing.
export function sellRate(prices: SunlightKwPrices | null, override: number | null): SellRate | null {
  if (override != null && override > 0) return { cents: override, label: "yours", yours: true };
  const s = prices?.sell;
  if (!s) return null;
  const where = prices?.place?.state_name ?? s.state_id;
  return { cents: s.cents_per_kwh, label: `EIA ${where}, ${periodLabel(s.period)}`, yours: false };
}
