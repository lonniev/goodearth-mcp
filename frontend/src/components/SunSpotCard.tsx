// One spot's light: its class, its sky, its sun month by month, what panels
// there would make. Opens on a tap inside the plot with the Sun layer on, as
// a row of three cards under the map, like the block summary below it.
//
// The sky dome is the chart every shade tool draws — zenith at the centre,
// horizon at the rim, the silhouette of hills and trees, and the sun's path
// on three days with the hidden stretches dashed. It is small static SVG, so
// it is plain JSX; no zoom, no frame.

import { useTimezone } from "@tollbooth-dpyc/web/react";
import { useEffect, useMemo, useState } from "react";
import {
  arrayKwhPerKw, capacityKw, dailyIncomeUsd, dailyKwh, footprintBounds, installUsd, MAX_M, MIN_M, sellRate,
  type ArraySize,
} from "../lib/arrayEconomics";
import { MONTHS } from "../lib/companions";
import type { SunlightKwPrices, SunlightResult } from "../lib/mcp";
import { roughly, usd } from "../lib/money";
import { readPrefs, writePrefs } from "../lib/prefs";
import { readingTime } from "../lib/readingTime";
import {
  accessOf, BINS, cellCentre, CLASS_COLOUR, classOf, hoursOf, kwhOf, leastLightMonth, type LightClass, type SunGrid,
} from "../lib/sunGrid";
import Provenance from "./Provenance";
import { Glyph, ICON } from "./ui";

const CLASS_NAME: Record<LightClass, string> = { full_sun: "Full sun", part_shade: "Part shade", full_shade: "Full shade" };
const CLASS_CHIP: Record<LightClass, string> = {
  full_sun: "bg-[#F2C64F]/30 text-ink", part_shade: "bg-[#8E6488]/25 text-ink", full_shade: "bg-[#273049]/15 text-ink",
};
const HILLS = "#A9773F";
const TREES = "#66731F";
const PATHS: [keyof NonNullable<SunlightResult["sun_paths"]>, string, string][] = [
  ["june", "#E09A3A", "Jun"], ["equinox", "#8E6488", "Mar/Sep"], ["december", "#4A7394", "Dec"],
];
const FULL_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function SunSpotCard({ grid, result, cell, month, fullLeaf, onCost, array, onArray }: {
  grid: SunGrid | null;
  result: SunlightResult | null;
  cell: number;
  month: number;
  fullLeaf: boolean;
  onCost?: (sats: number) => void;
  /// The array on the spot, metres, and the change a typed size makes.
  array: ArraySize;
  onArray: (s: ArraySize) => void;
}) {
  // When the answer was taken, once per answer. A fresh Date on every render
  // re-fired the price report on every render — and this card now renders
  // on every pixel of a drag.
  const at = useMemo(() => new Date(), [result]);
  // Nothing until a tap: the line under the map already says to tap, and a
  // row of cards saying it again would be the space the answer needs.
  if (!grid || !result || cell < 0) return null;
  const hours = hoursOf(grid, cell, month, fullLeaf);
  const cls = classOf(hours);
  const low = leastLightMonth(grid, cell, fullLeaf);
  const kwh = kwhOf(grid, cell, fullLeaf);
  const access = accessOf(grid, cell, fullLeaf);
  const canopy = result.sources.find((s) => s.name.includes("canopy"));
  const years = result.solar?.radiation_years;
  const sourcesLine = [
    canopy?.observed ? `canopy imagery ${canopy.observed}` : "canopy imagery",
    "terrain 30 m",
    years ? `${years} years of sunshine` : null,
  ].filter(Boolean).join(" · ");

  // One row, three cards — the same grid and chrome as the block summary
  // under it, so the page is rows of equal height and the map keeps its
  // whole width. A side column made the row as tall as the dome and left
  // the map floating over empty paper.
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="figure text-[15.5px]">This spot</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASS_CHIP[cls]}`}>{CLASS_NAME[cls]}</span>
        </div>
        <p className="mt-1"><span className="figure text-[26px] leading-none">{hours.toFixed(1)}</span>
          <span className="ml-1 text-[12px] text-ink-soft">h of direct sun a day in {FULL_MONTH[month]}</span></p>
        <SkyDome grid={grid} cell={cell} paths={result.sun_paths} fullLeaf={fullLeaf} leafOn={result.light.leaf_on_months.includes(month + 1)} />
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-ink-soft">
          <Key colour={HILLS}>Hills</Key>
          <Key colour={TREES} faint>Trees</Key>
          {PATHS.map(([, c, label]) => <Key key={label} colour={c}>{label}</Key>)}
          <span>dashed = sun hidden</span>
        </div>
      </div>

      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[15.5px]">Direct sun, month by month</h3>
        <MonthBars grid={grid} cell={cell} month={month} fullLeaf={fullLeaf} />
        <p className="mt-2 text-[12px] text-ink-soft">
          Least light in {FULL_MONTH[low]}: {hoursOf(grid, cell, low, fullLeaf).toFixed(1)} h a day.
        </p>
      </div>

      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[15.5px]">Panels here</h3>
        {kwh !== null && access !== null ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded border border-rule px-3 py-2">
                <div className="figure text-[20px] leading-tight">{Math.round(kwh).toLocaleString()}</div>
                <div className="text-[11px] text-ink-soft">kWh per kW a year</div>
              </div>
              <div className="rounded border border-rule px-3 py-2">
                <div className="figure text-[20px] leading-tight">{Math.round(access)}%</div>
                <div className="text-[11px] text-ink-soft">of open-sky yield</div>
              </div>
            </div>
            <ArrayRows grid={grid} cell={cell} fullLeaf={fullLeaf} prices={result.kw_prices} array={array} onArray={onArray} />
            <p className="mt-2 text-[12px] text-ink-soft">A screening estimate, not a site survey.</p>
          </>
        ) : (
          <p className="mt-1 text-[12px] text-ink-soft">No solar figures for this plot.</p>
        )}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="data text-[10.5px] text-ink-soft">{sourcesLine}</span>
          <Provenance tool="goodearth_sunlight" at={at} from={readingTime(result)} onCost={onCost} />
        </div>
      </div>
    </div>
  );
}

function Key({ colour, faint, children }: { colour: string; faint?: boolean; children: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colour, opacity: faint ? 0.6 : 1 }} />
      {children}
    </span>
  );
}

// ─── The sky dome ────────────────────────────────────────────────────────

const S = 260;
const CX = S / 2;
const CY = S / 2 + 2;
const R = 108;

function pt(azDeg: number, el: number): [number, number] {
  const r = (R * (90 - el)) / 90;
  const a = (azDeg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

function wedge(value: (bin: number) => number): string {
  let d = "";
  for (let b = 0; b < BINS; b++) {
    const v = value(b);
    if (v <= 0.5) continue;
    const a0 = b * (360 / BINS);
    const a1 = a0 + 360 / BINS;
    const [x0, y0] = pt(a0, 0);
    const [x1, y1] = pt(a1, 0);
    const [x2, y2] = pt(a1, v);
    const [x3, y3] = pt(a0, v);
    d += `M${x0.toFixed(1)},${y0.toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}L${x3.toFixed(1)},${y3.toFixed(1)}Z`;
  }
  return d;
}

export function SkyDome({ grid, cell, paths, fullLeaf, leafOn }: {
  grid: SunGrid; cell: number; paths?: SunlightResult["sun_paths"]; fullLeaf: boolean; leafOn: boolean;
}) {
  const [, zone] = useTimezone();
  // The hour on the grower's clock for a UTC minute on June 21, so the dots
  // read "6h … 18h" where the day actually is.
  const localHour = (minutes: number): number => {
    const at = new Date(Date.UTC(new Date().getUTCFullYear(), 5, 21, 0, Math.round(minutes)));
    const h = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: zone }).formatToParts(at)
      .find((p) => p.type === "hour")?.value;
    return Number(h ?? 0);
  };
  const terrain = grid.terrain.subarray(cell * BINS, cell * BINS + BINS);
  const canopy = grid.canopy.subarray(cell * BINS, cell * BINS + BINS);
  // Out of leaf, a bare deciduous crown does not hide the sun outright; the
  // dome draws the tree line as it stands and dashes only what the hills or
  // an evergreen take. In leaf (or with the chip set to full leaf) every tree hides it.
  const kinds = grid.kind.subarray(cell * BINS, cell * BINS + BINS);
  const hides = (b: number, el: number) => {
    if (el < terrain[b]) return true;
    if (el >= canopy[b]) return false;
    return leafOn || fullLeaf || kinds[b] === 1; // evergreen
  };
  const lines: { d: string; colour: string; dashed: boolean }[] = [];
  const dots: [number, number, string][] = [];
  for (const [key, colour] of PATHS) {
    const path = paths?.[key] ?? [];
    let seg: string[] = [];
    let vis: boolean | null = null;
    const flush = () => { if (seg.length > 1) lines.push({ d: seg.join(" "), colour, dashed: !vis }); };
    let prevMinutes = -1e9;
    path.forEach(([az, el, minutes]) => {
      // The path is ordered by UTC, so a block west of Greenwich lists its
      // evening before its morning; a jump of more than an hour is the night.
      if (minutes - prevMinutes > 90) { flush(); seg = []; vis = null; }
      prevMinutes = minutes;
      if (el < 0) { flush(); seg = []; vis = null; return; }
      const b = Math.floor((((az % 360) + 360) % 360) / (360 / BINS));
      const v = !hides(b, el);
      const [x, y] = pt(az, el);
      const p = `${x.toFixed(1)},${y.toFixed(1)}`;
      if (vis === null) vis = v;
      if (v !== vis) { seg.push(p); flush(); seg = [p]; vis = v; } else seg.push(p);
      if (key === "june") {
        const h = localHour(minutes);
        if (h % 3 === 0 && h >= 6 && h <= 18) dots.push([x, y, `${h}h`]);
      }
    });
    flush();
  }
  return (
    <svg viewBox={`0 0 ${S} ${S + 4}`} className="mx-auto mt-1 block w-full max-w-[220px]" role="img"
      aria-label="Sky above this spot: the tree and hill silhouette with the sun's path in June, at the equinoxes and in December">
      <circle cx={CX} cy={CY} r={R} fill="#FFFBF2" />
      <path d={wedge((b) => Math.max(canopy[b], terrain[b]))} fill={TREES} opacity={0.55} />
      <path d={wedge((b) => terrain[b])} fill={HILLS} opacity={0.85} />
      {[0, 30, 60].map((e) => (
        <circle key={e} cx={CX} cy={CY} r={(R * (90 - e)) / 90} fill="none" stroke="#D8B26E" strokeWidth={e ? 0.6 : 1} />
      ))}
      {([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as [string, number][]).map(([t, a]) => {
        const [x, y] = pt(a, -9);
        return <text key={t} x={x} y={y + 3} textAnchor="middle" fontSize={10} fontWeight={500} fill="#3A2210">{t}</text>;
      })}
      {[30, 60].map((e) => { const [x, y] = pt(322, e); return <text key={e} x={x} y={y} fontSize={8} fill="#6A566F">{e}°</text>; })}
      {lines.map((l, i) => (
        <polyline key={i} points={l.d} fill="none" stroke={l.colour} strokeWidth={l.dashed ? 1.6 : 2.4}
          strokeDasharray={l.dashed ? "3 3" : undefined} opacity={l.dashed ? 0.75 : 1} strokeLinecap="round" />
      ))}
      {dots.map(([x, y, label]) => (
        <g key={label}>
          <circle cx={x} cy={y} r={2.6} fill="#E09A3A" stroke="#FDF5E6" strokeWidth={1} />
          <text x={x + 5} y={y - 4} fontSize={8} fill="#6A566F">{label}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Month bars ──────────────────────────────────────────────────────────

export function MonthBars({ grid, cell, month, fullLeaf }: { grid: SunGrid; cell: number; month: number; fullLeaf: boolean }) {
  const W = 280, H = 118, L = 20, B = 16, T = 6, HMAX = 15;
  const y = (h: number) => T + (H - T - B) * (1 - Math.min(h, HMAX) / HMAX);
  const bw = (W - L) / 12;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full" role="img" aria-label="Hours of direct sun a day at this spot, month by month">
      {[0, 3, 6, 9, 12, 15].map((t) => <text key={t} x={L - 4} y={y(t) + 3} textAnchor="end" fontSize={8} fill="#6A566F">{t}</text>)}
      <line x1={L} x2={W} y1={y(0)} y2={y(0)} stroke="#D8B26E" />
      {MONTHS.map((name, m) => {
        const h = hoursOf(grid, cell, m, fullLeaf);
        const x = L + m * bw + 3;
        const sel = m === month;
        return (
          <g key={name}>
            <rect x={x} y={y(h)} width={bw - 6} height={y(0) - y(h)} fill={CLASS_COLOUR[classOf(h)]}
              stroke={sel ? "#3A2210" : undefined} strokeWidth={sel ? 1.5 : undefined} />
            <text x={x + (bw - 6) / 2} y={H - 4} textAnchor="middle" fontSize={8} fill={sel ? "#3A2210" : "#6A566F"} fontWeight={sel ? 500 : 400}>{name}</text>
          </g>
        );
      })}
      {[3, 6].map((t) => <line key={t} x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#3A2210" strokeDasharray="3 3" strokeWidth={0.8} opacity={0.55} />)}
    </svg>
  );
}


// ── The array on the spot ────────────────────────────────────────────────

/// A footprint in metres, what it would cost and what it would earn. The
/// prices arrived with the answer, read live by the operator; the arithmetic
/// is here, so a drag costs nothing and a typed metre answers at once.
function ArrayRows({ grid, cell, fullLeaf, prices, array, onArray }: {
  grid: SunGrid;
  cell: number;
  fullLeaf: boolean;
  prices: SunlightKwPrices | null;
  array: ArraySize;
  onArray: (s: ArraySize) => void;
}) {
  const [sellCents, setSellCents] = useState<number | null>(() => readPrefs().sellCents);
  const [editing, setEditing] = useState(false);
  const perKw = arrayKwhPerKw(grid, footprintBounds(cellCentre(grid, cell), array), fullLeaf, cell);
  const m2 = array.w * array.l;
  const kw = prices ? capacityKw(array, prices.array_w_per_m2) : null;
  const cost = prices && kw != null ? installUsd(kw, prices) : null;
  const made = kw != null && perKw != null ? dailyKwh(kw, perKw) : null;
  const rate = sellRate(prices, sellCents);
  const income = made != null && rate ? dailyIncomeUsd(made, rate.cents) : null;

  const setRate = (v: number | null) => {
    setSellCents(v);
    writePrefs({ ...readPrefs(), sellCents: v });
    setEditing(false);
  };

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <span className="text-ink-soft">Array</span>
        <Metres value={array.w} glyph="⟷" label="Width, metres east to west" onChange={(w) => onArray({ ...array, w })} />
        <Metres value={array.l} glyph="↕" label="Length, metres north to south" onChange={(l) => onArray({ ...array, l })} />
        <span className="data text-ink-soft">
          {m2.toLocaleString()} m²{kw != null && <> · {kw < 10 ? kw.toFixed(1) : Math.round(kw).toLocaleString()} kW</>}
        </span>
      </div>
      {prices ? (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Fig big={cost == null ? "—" : usd(roughly(cost))} small="to install" why={cost == null ? prices.reasons.install : undefined} />
            <Fig big={made == null ? "—" : Math.round(made).toLocaleString()} small="kWh a day" />
            <Fig big={income == null ? "—" : usd(roughly(income), 2)} small="a day, sold" why={rate ? undefined : prices.reasons.sell} />
          </div>
          <div className="data mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-soft">
            {prices.install
              ? <span>DOE benchmark {prices.install.quarter}</span>
              : <span title={prices.reasons.install}>no benchmark read</span>}
            <span aria-hidden="true">·</span>
            {editing ? (
              <RateInput initial={sellCents ?? prices.sell?.cents_per_kwh ?? null} onDone={setRate} />
            ) : (
              // One span, so the pencil wraps with the rate it edits and never alone.
              <span className="inline-flex items-center gap-1">
                {rate
                  ? <span>{rate.label} · {rate.cents.toFixed(1)} ¢/kWh</span>
                  : <span title={prices.reasons.sell}>no tariff on file</span>}
                <button type="button" onClick={() => setEditing(true)}
                  aria-label="Set what a kWh sells for" title="What your utility pays for a kWh"
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-soft active:text-ink">
                  <Glyph path={ICON.edit} size={14} />
                </button>
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[12px] text-ink-soft">No prices came with this reading.</p>
      )}
    </>
  );
}

function Fig({ big, small, why }: { big: string; small: string; why?: string }) {
  return (
    <div className="rounded border border-rule px-2 py-1.5" title={why}>
      <div className="figure text-[17px] leading-tight">{big}</div>
      <div className="text-[10.5px] text-ink-soft">{small}</div>
    </div>
  );
}

/// A metre field that takes what is typed as it is typed, and settles to the
/// limits on leaving. The prop moves under it when the handle is dragged.
function Metres({ value, glyph, label, onChange }: {
  value: number; glyph: string; label: string; onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n >= MIN_M && n <= MAX_M) onChange(n);
    else setText(String(value));
  };
  return (
    <label className="flex items-center gap-1">
      <span aria-hidden="true" className="text-ink-soft">{glyph}</span>
      <input type="number" inputMode="numeric" min={MIN_M} max={MAX_M} step={1} value={text} aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= MIN_M && n <= MAX_M) onChange(n);
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="data h-8 w-14 rounded border border-rule bg-paper px-1.5 text-right text-[12.5px]" />
      <span className="text-ink-soft">m</span>
    </label>
  );
}

/// The ¢/kWh a grower types; empty clears it and the read rate stands again.
function RateInput({ initial, onDone }: { initial: number | null; onDone: (v: number | null) => void }) {
  const [text, setText] = useState(initial == null ? "" : String(initial));
  const done = () => {
    const n = Number(text);
    onDone(text.trim() && Number.isFinite(n) && n > 0 && n < 200 ? Math.round(n * 10) / 10 : null);
  };
  return (
    <span className="flex items-center gap-1">
      <input type="number" inputMode="decimal" min={0} max={200} step={0.1} value={text} autoFocus
        aria-label="Cents per kWh your utility pays"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") done(); if (e.key === "Escape") onDone(initial); }}
        className="data h-7 w-16 rounded border border-rule bg-paper px-1.5 text-right text-[11px]" />
      <span>¢/kWh</span>
      <button type="button" onClick={done} aria-label="Keep this rate"
        className="inline-flex h-7 w-7 items-center justify-center rounded text-growth">✓</button>
    </span>
  );
}
