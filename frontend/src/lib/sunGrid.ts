// The Sunlight grid as the map and the cards read it — decoded once, then pure.
//
// The service answers `detail="grid"` with every cell's numbers packed as
// base64 rasters (row 0 north, a nodata sentinel where the block is not) and
// the per-cell horizons zlib'd on top. This module turns that into typed
// arrays, and everything after — the colour of a cell, its class, the block's
// shares, the best place for panels — is arithmetic over those arrays. Nothing
// here touches the DOM, so all of it runs under node's test runner.

import { unzlibSync } from "fflate";

export type SunView = "garden" | "solar";
export type LightClass = "full_sun" | "part_shade" | "full_shade";

export interface WireField {
  dtype: "uint8" | "uint16";
  scale: number;
  nodata: number;
  encoding: "base64";
  b64: string;
}

export interface WirePacked {
  dtype: "uint8";
  shape: number[];
  encoding: "zlib+base64";
  b64: string;
}

export interface WireGrid {
  rows: number;
  cols: number;
  cell_m: number;
  cells: number;
  bounds: { min_lat: number; min_lon: number; max_lat: number; max_lon: number };
  fields: {
    hours_by_month: WireField[];
    hours_by_month_in_leaf?: WireField[];
    kwh_per_kwp_year?: WireField;
    solar_access_pct?: WireField;
    kwh_per_kwp_year_in_leaf?: WireField;
    solar_access_pct_in_leaf?: WireField;
    horizon_terrain_deg: WirePacked;
    horizon_canopy_deg: WirePacked;
    canopy_kind: WirePacked;
  };
}

export interface SunPath { june: number[][]; equinox: number[][]; december: number[][] }

export interface SunGrid {
  rows: number;
  cols: number;
  cellM: number;
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  /// Flat row-major index → kept-cell index, or −1 outside the block.
  kept: Int32Array;
  n: number;
  /// Hours of direct sun a day, `[cell * 12 + month]`, with the block's own leaf season.
  hours: Float32Array;
  /// The same with every tree in leaf all year, or `hours` again when no month is bare.
  hoursInLeaf: Float32Array;
  kwh: Float32Array | null;
  kwhInLeaf: Float32Array | null;
  access: Float32Array | null;
  accessInLeaf: Float32Array | null;
  /// Per kept cell, 72 bins clockwise from north, whole degrees.
  terrain: Uint8Array;
  canopy: Uint8Array;
  kind: Uint8Array;
}

export const BINS = 72;
export const FULL_SUN_H = 6;
export const PART_SHADE_H = 3;

export function classOf(hours: number): LightClass {
  return hours >= FULL_SUN_H ? "full_sun" : hours >= PART_SHADE_H ? "part_shade" : "full_shade";
}

// ─── Decoding ────────────────────────────────────────────────────────────

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/// zlib → bytes, in plain JS. The browser's DecompressionStream read through
/// a Response never resolves on iPad Safari (seen live 2026-10-07: the panel
/// said "Casting the sky…" for minutes after the answer arrived), so the
/// inflate is fflate's, which owes the browser nothing.
function inflate(b64: string): Uint8Array {
  return unzlibSync(bytes(b64));
}

/// A raster field as float32 over kept cells only, in kept order.
function unpack(field: WireField, kept: Int32Array, n: number): Float32Array {
  const raw = bytes(field.b64);
  const values = field.dtype === "uint16"
    ? new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
    : raw;
  const out = new Float32Array(n);
  for (let i = 0; i < kept.length; i++) {
    const k = kept[i];
    if (k >= 0) out[k] = values[i] * field.scale;
  }
  return out;
}

function months(fields: WireField[], kept: Int32Array, n: number): Float32Array {
  const out = new Float32Array(n * 12);
  fields.forEach((f, m) => {
    const col = unpack(f, kept, n);
    for (let k = 0; k < n; k++) out[k * 12 + m] = col[k];
  });
  return out;
}

export async function decodeGrid(wire: WireGrid): Promise<SunGrid> {
  const { rows, cols, fields } = wire;
  const june = fields.hours_by_month[5];
  const mask = bytes(june.b64);
  const kept = new Int32Array(rows * cols).fill(-1);
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== june.nodata) kept[i] = n++;

  const hours = months(fields.hours_by_month, kept, n);
  const terrain = inflate(fields.horizon_terrain_deg.b64);
  const canopy = inflate(fields.horizon_canopy_deg.b64);
  const kind = inflate(fields.canopy_kind.b64);
  const kwh = fields.kwh_per_kwp_year ? unpack(fields.kwh_per_kwp_year, kept, n) : null;
  const access = fields.solar_access_pct ? unpack(fields.solar_access_pct, kept, n) : null;
  return {
    rows, cols, cellM: wire.cell_m,
    bounds: { minLat: wire.bounds.min_lat, minLon: wire.bounds.min_lon, maxLat: wire.bounds.max_lat, maxLon: wire.bounds.max_lon },
    kept, n, hours,
    hoursInLeaf: fields.hours_by_month_in_leaf ? months(fields.hours_by_month_in_leaf, kept, n) : hours,
    kwh, access,
    kwhInLeaf: fields.kwh_per_kwp_year_in_leaf ? unpack(fields.kwh_per_kwp_year_in_leaf, kept, n) : kwh,
    accessInLeaf: fields.solar_access_pct_in_leaf ? unpack(fields.solar_access_pct_in_leaf, kept, n) : access,
    terrain, canopy, kind,
  };
}

// ─── Reading cells ───────────────────────────────────────────────────────

/// Kept-cell index under a point, or −1 outside the block.
export function cellAt(g: SunGrid, lat: number, lon: number): number {
  const dLat = (g.bounds.maxLat - g.bounds.minLat) / g.rows;
  const dLon = (g.bounds.maxLon - g.bounds.minLon) / g.cols;
  const r = Math.floor((g.bounds.maxLat - lat) / dLat);
  const c = Math.floor((lon - g.bounds.minLon) / dLon);
  if (r < 0 || r >= g.rows || c < 0 || c >= g.cols) return -1;
  return g.kept[r * g.cols + c];
}

/// Centre of a kept cell.
export function cellCentre(g: SunGrid, k: number): { lat: number; lon: number } {
  const flat = g.kept.indexOf(k);
  const r = Math.floor(flat / g.cols);
  const c = flat % g.cols;
  const dLat = (g.bounds.maxLat - g.bounds.minLat) / g.rows;
  const dLon = (g.bounds.maxLon - g.bounds.minLon) / g.cols;
  return { lat: g.bounds.maxLat - (r + 0.5) * dLat, lon: g.bounds.minLon + (c + 0.5) * dLon };
}

export function hoursOf(g: SunGrid, k: number, month: number, fullLeaf: boolean): number {
  return (fullLeaf ? g.hoursInLeaf : g.hours)[k * 12 + month];
}

export function kwhOf(g: SunGrid, k: number, fullLeaf: boolean): number | null {
  const a = fullLeaf ? g.kwhInLeaf : g.kwh;
  return a ? a[k] : null;
}

export function accessOf(g: SunGrid, k: number, fullLeaf: boolean): number | null {
  const a = fullLeaf ? g.accessInLeaf : g.access;
  return a ? a[k] : null;
}

// ─── Colour ──────────────────────────────────────────────────────────────

/// The six stops of the sun ramp, hours 0–12, from the design mock. Dark
/// indigo for shade through plum to honey and a pale, sun-bleached yellow.
export const SUN_STOPS: [number, [number, number, number]][] = [
  [0, [0x27, 0x30, 0x49]],
  [2, [0x47, 0x46, 0x7a]],
  [4, [0x8e, 0x64, 0x88]],
  [6, [0xe0, 0x9a, 0x3a]],
  [9, [0xf2, 0xc6, 0x4f]],
  [12, [0xff, 0xf1, 0xb5]],
];
export const CLASS_COLOUR: Record<LightClass, string> = {
  full_shade: "#273049", part_shade: "#8E6488", full_sun: "#F2C64F",
};
export const KWH_RAMP = { lo: 300, hi: 1300 };

/// RGB for hours on the 0–12 ramp.
export function ramp(hours: number): [number, number, number] {
  const h = Math.max(0, Math.min(12, hours));
  for (let i = 1; i < SUN_STOPS.length; i++) {
    const [h0, c0] = SUN_STOPS[i - 1];
    const [h1, c1] = SUN_STOPS[i];
    if (h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * t)) as [number, number, number];
    }
  }
  return SUN_STOPS[SUN_STOPS.length - 1][1];
}

/// kWh/kWp per year mapped onto the same ramp, 300–1300 ↔ 0–12 h.
export function kwhRamp(kwh: number): [number, number, number] {
  return ramp(((kwh - KWH_RAMP.lo) / (KWH_RAMP.hi - KWH_RAMP.lo)) * 12);
}

export function css(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/// RGBA pixels for the overlay, one per raster cell, row 0 north; alpha 0 off the block.
export function paint(g: SunGrid, view: SunView, month: number, fullLeaf: boolean): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(g.rows * g.cols * 4));
  for (let i = 0; i < g.kept.length; i++) {
    const k = g.kept[i];
    if (k < 0) continue;
    let rgb: [number, number, number];
    if (view === "solar") {
      const kwh = kwhOf(g, k, fullLeaf);
      if (kwh === null) continue;
      rgb = kwhRamp(kwh);
    } else {
      rgb = ramp(hoursOf(g, k, month, fullLeaf));
    }
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255;
  }
  return out;
}

// ─── The block in one reading ────────────────────────────────────────────

export interface SunSummary {
  /// Share of the block in each class for the chosen month.
  share: Record<LightClass, number>;
  /// Share in full sun for each of the twelve months.
  fullSunByMonth: number[];
  medianHours: number;
  /// Kept-cell index of the best place for panels, or −1 without solar.
  best: number;
  bestKwh: number | null;
  bestAccess: number | null;
}

export function summary(g: SunGrid, month: number, fullLeaf: boolean): SunSummary {
  const share: Record<LightClass, number> = { full_sun: 0, part_shade: 0, full_shade: 0 };
  const fullSunByMonth = new Array<number>(12).fill(0);
  const hrs: number[] = [];
  for (let k = 0; k < g.n; k++) {
    const h = hoursOf(g, k, month, fullLeaf);
    hrs.push(h);
    share[classOf(h)] += 1;
    for (let m = 0; m < 12; m++) if (hoursOf(g, k, m, fullLeaf) >= FULL_SUN_H) fullSunByMonth[m] += 1;
  }
  for (const c of Object.keys(share) as LightClass[]) share[c] /= Math.max(g.n, 1);
  hrs.sort((a, b) => a - b);
  let best = -1;
  let bestKwh: number | null = null;
  const kwh = fullLeaf ? g.kwhInLeaf : g.kwh;
  if (kwh) {
    for (let k = 0; k < g.n; k++) if (bestKwh === null || kwh[k] > bestKwh) { bestKwh = kwh[k]; best = k; }
  }
  return {
    share,
    fullSunByMonth: fullSunByMonth.map((c) => c / Math.max(g.n, 1)),
    medianHours: hrs.length ? hrs[Math.floor(hrs.length / 2)] : 0,
    best, bestKwh,
    bestAccess: best >= 0 ? accessOf(g, best, fullLeaf) : null,
  };
}

/// Month of least direct sun for one cell (0-based).
export function leastLightMonth(g: SunGrid, k: number, fullLeaf: boolean): number {
  let least = 0;
  for (let m = 1; m < 12; m++) if (hoursOf(g, k, m, fullLeaf) < hoursOf(g, k, least, fullLeaf)) least = m;
  return least;
}

/// "Bare trees Nov–Apr" from the service's leaf-off months (1-based), or null when none.
export function bareSpan(leafOff: number[], names: readonly string[]): string | null {
  if (!leafOff.length) return null;
  if (leafOff.length === 12) return "Bare trees all year";
  // The bare months wrap the new year; find the run that does not contain a leaf-on month.
  const set = new Set(leafOff);
  let start = leafOff[0];
  for (const m of leafOff) if (!set.has(m === 1 ? 12 : m - 1)) start = m;
  let end = start;
  while (set.has(end === 12 ? 1 : end + 1) && end !== (start === 1 ? 12 : start - 1)) end = end === 12 ? 1 : end + 1;
  return `Bare trees ${names[start - 1]}–${names[end - 1]}`;
}
