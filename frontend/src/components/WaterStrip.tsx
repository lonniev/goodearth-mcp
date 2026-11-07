// The water panel: rain against what the air pulls out, and how wet the soil is.
//
// One chart and one row of gauges. Above the line, each day's rain; below it,
// each day's reference evapotranspiration (FAO-56 ET0), what a short grass crop
// would give up to the air. The running balance is drawn across both, so a
// fortnight of dry days reads as a line walking down. The week ahead is the
// forecast and is drawn fainter, after a mark at today.
//
// Under it, the model's soil at two depths, and the plot's own probe beside
// them when its station has one. The model and the probe are not calibrated to
// each other: the probe is what this ground says, the model is the grid's soil.
//
// Conditions only: whether to water is the grower's call.

import { useEffect, useState } from "react";
import { getStoredNpub } from "@tollbooth-dpyc/web";
import type { WaterBalanceResult } from "../lib/mcp";
import type { StationReading } from "../lib/stationNow";
import { loadConditions, loadStation } from "../lib/pageLoads";
import { depth, percent } from "../lib/waterLine";
import { useUnits } from "./Units";

const COL = 20;          // one day's width in chart units
const HALF = 34;         // bar room above and below the line
const TOP = 6;           // headroom for the balance line's label
const AXIS = 14;         // weekday labels
/// The gauges' full scale. Mineral soils hold about this much water when saturated.
const FULL = 0.5;

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
}

/// The plot's own soil probes, if its station reports any. Reads through the
/// page cache, so the Dashboard's warm of the Almanac's station pays for it.
function useProbes(blockId: string): StationReading[] {
  const [probes, setProbes] = useState<StationReading[]>([]);
  useEffect(() => {
    let live = true;
    setProbes([]);
    if (!getStoredNpub()) return;
    void (async () => {
      const station = await loadStation(blockId);
      if (!live || !station) return;
      const report = await loadConditions(blockId);
      if (live) setProbes(report.readings.filter((r) => r.sensor_kind === "soil_moisture"));
    })().catch(() => {});
    return () => { live = false; };
  }, [blockId]);
  return probes;
}

function Gauge({ label, sub, value, tone }: {
  label: string; sub?: string; value: number | null; tone: "model" | "probe";
}) {
  const fill = value == null ? 0 : Math.max(0.04, Math.min(1, value / FULL));
  return (
    <div className="flex items-end gap-2">
      <span className="flex h-10 w-3.5 items-end overflow-hidden rounded-full bg-band" aria-hidden>
        <span className={`w-full rounded-full ${tone === "probe" ? "bg-growth" : "bg-frost"}`}
          style={{ height: `${fill * 100}%` }} />
      </span>
      <span className="leading-tight">
        <b className="figure block text-[17px]">{percent(value)}</b>
        <span className="block text-[11.5px] text-ink-soft">{label}</span>
        {sub && <span className="data block text-[10px] text-ink-soft">{sub}</span>}
      </span>
    </div>
  );
}

export default function WaterStrip({ data, blockId }: { data: WaterBalanceResult; blockId: string }) {
  const u = useUnits();
  const probes = useProbes(blockId);
  const days = data.days;
  if (!days.length) return null;

  const width = days.length * COL;
  const height = TOP + HALF * 2 + AXIS;
  const mid = TOP + HALF;
  const peak = Math.max(...days.map((d) => Math.max(d.rain_mm ?? 0, d.et0_mm ?? 0)), 1);
  const bar = (mm: number | null) => ((mm ?? 0) / peak) * (HALF - 2);
  const swing = Math.max(...days.map((d) => Math.abs(d.balance_mm)), 1);
  const lineY = (mm: number) => mid - (mm / swing) * (HALF - 2);
  const todayAt = days.findIndex((d) => d.forecast);
  const path = days.map((d, i) => `${i ? "L" : "M"}${i * COL + COL / 2},${lineY(d.balance_mm).toFixed(1)}`).join(" ");
  const change = data.today.root_zone_week_change;

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img"
        aria-label={`Rain and evapotranspiration per day; balance ${depth(data.today.balance_mm, u.unit)} today`}>
        {todayAt > 0 && (
          <rect x={todayAt * COL} y={TOP - 4} width={width - todayAt * COL} height={HALF * 2 + 6}
            className="fill-band" opacity={0.45} />
        )}
        <line x1={0} x2={width} y1={mid} y2={mid} className="stroke-rule" strokeWidth={1} />
        {days.map((d, i) => {
          const x = i * COL + 4;
          const faint = d.forecast ? 0.55 : 1;
          return (
            <g key={d.date} opacity={faint}>
              <title>{`${d.date}: rain ${d.rain_mm == null ? "—" : depth(d.rain_mm, u.unit)}, `
                + `ET₀ ${d.et0_mm == null ? "—" : depth(d.et0_mm, u.unit)}, `
                + `balance ${depth(d.balance_mm, u.unit)}`
                + (d.root_zone != null ? `, root zone ${percent(d.root_zone)}` : "")}</title>
              {(d.rain_mm ?? 0) > 0 && (
                <rect x={x} y={mid - bar(d.rain_mm)} width={COL - 8} height={bar(d.rain_mm)} rx={2} className="fill-frost" />
              )}
              {(d.et0_mm ?? 0) > 0 && (
                <rect x={x} y={mid} width={COL - 8} height={bar(d.et0_mm)} rx={2} className="fill-honey" opacity={0.7} />
              )}
              <text x={i * COL + COL / 2} y={height - 3} textAnchor="middle"
                className={`fill-ink-soft ${i === todayAt - 1 ? "font-bold" : ""}`} fontSize={9}>
                {i === todayAt - 1 ? "today" : weekday(d.date)}
              </text>
            </g>
          );
        })}
        <path d={path} fill="none" className="stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        <Gauge label="topsoil, model" sub="0–9 cm" value={data.today.topsoil} tone="model" />
        <Gauge label="root zone, model"
          sub={change == null ? "9–81 cm"
            : `9–81 cm · ${change > 0 ? "▲" : change < 0 ? "▼" : "="} ${Math.abs(Math.round(change * 100))} pts this week`}
          value={data.today.root_zone} tone="model" />
        {probes.map((p) => (
          <Gauge key={`${p.channel}`} label={`probe${p.channel_name ? ` ${p.channel_name}` : ""}`}
            sub="your station" value={p.unit === "%" ? p.quantity / 100 : p.quantity} tone="probe" />
        ))}
      </div>

      {/* The key, once, in the chart's own marks. */}
      <p className="data mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-ink-soft">
        <span><span className="mr-1 inline-block h-2 w-1.5 rounded-sm bg-frost align-middle" />rain</span>
        <span><span className="mr-1 inline-block h-2 w-1.5 rounded-sm bg-honey/70 align-middle" />to the air (ET₀)</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-ink align-middle" />running balance</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-band align-middle" />forecast</span>
      </p>
    </>
  );
}
