// Heat Ledger — the season-curve view.
//
// Everything on this page comes from one call to goodearth_gdd_season_curve.
// Where a figure would need a tool that has not shipped, the slot says so
// plainly instead of showing a plausible number: a grower who plans around a
// fabricated frost date loses a crop.

import { useCallback, useEffect, useState } from "react";
import SeasonChart from "../components/SeasonChart";
import FrostCard from "../components/FrostCard";
import SoilCard from "../components/SoilCard";
import Provenance from "../components/Provenance";
import { frostWindow, gddSeasonCurve, soilTempProjection, type FrostWindowResult, type SeasonCurveResult, type SoilWindowResult } from "../lib/mcp";
import type { SavedRegion } from "../lib/regions";

interface Props {
  region: SavedRegion;
  onMeasured: (areaHa: number, samples: number) => void;
  onCost: (sats: number) => void;
  /// Lifted so the hive in the corner can read the same night the frost card
  /// does — the hive is an instrument, and it must not disagree with the page.
  onFrost?: (f: FrostWindowResult | null) => void;
}

export default function HeatLedger({ region, onMeasured, onCost, onFrost }: Props) {
  const [data, setData] = useState<SeasonCurveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [frost, setFrost] = useState<FrostWindowResult | null>(null);
  const [frostAt, setFrostAt] = useState<Date | null>(null);
  const [soil, setSoil] = useState<SoilWindowResult | null>(null);
  const [soilAt, setSoilAt] = useState<Date | null>(null);

  const run = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const r = await gddSeasonCurve(region.region, region.baseTempF);
      if (!r.success) { setError(r.error || "The service could not answer for this ground."); return; }
      setData(r);
      setRanAt(new Date());
      if (r.region) onMeasured(r.region.area_km2 * 100, r.region.sample_count);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [region, onMeasured]);

  const runFrost = useCallback(async () => {
    try {
      const f = await frostWindow(region.region);
      if (!f.success) { setFrost(null); onFrost?.(null); return; }
      setFrost(f);
      setFrostAt(new Date());
      onFrost?.(f);
    } catch {
      // The season still stands without it; the frost tiles just stay empty
      // rather than showing a date nobody can back up.
      setFrost(null);
      onFrost?.(null);
    }
  }, [region, onFrost]);

  const runSoil = useCallback(async () => {
    try {
      // Autumn window at planting depth — the garlic question. A spring
      // warming window is the same call with direction flipped.
      const s = await soilTempProjection(region.region, 60, "cooling");
      if (!s.success) { setSoil(null); return; }
      setSoil(s); setSoilAt(new Date());
    } catch { setSoil(null); }
  }, [region]);

  // Re-read whenever the active region changes — the whole app is scoped by it.
  useEffect(() => { void run(); void runFrost(); void runSoil(); }, [run, runFrost, runSoil]);

  const g = data?.accumulated_gdd;
  const ahead = data?.normals?.ahead_of_normal_gdd ?? null;

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Heat Ledger</h1>
        <span className="text-[13px] text-ink-soft">
          {region.name}
          {data ? ` · season from ${fmt(data.season_start)} · base ${data.base_temp_f}°F` : ""}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">
          {error}
          <button onClick={run} className="ml-3 underline">Try again</button>
        </div>
      )}

      {/* ── Pulse strip ───────────────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-2 border-t-2 border-b border-t-ink border-b-rule md:grid-cols-4">
        <Pulse
          value={g ? Math.round(g.mean).toLocaleString() : busy ? "…" : "—"}
          unit={data ? `GDD${sub(data.base_temp_f)}` : ""}
          label="accumulated across the block (mean)"
        />
        <Pulse
          value={ahead == null ? "—" : `${ahead >= 0 ? "+" : ""}${Math.round(ahead)}`}
          tone={ahead == null ? undefined : ahead >= 0 ? "growth" : "frost"}
          label={
            data?.normals
              ? `${ahead == null ? "" : ahead >= 0 ? "ahead of" : "behind"} the last ${data.normals.span_years} seasons`
              : "against recent seasons"
          }
        />
        <Pulse
          value={frost?.first_frost ? shortDate(frost.first_frost.median) : "—"}
          tone="frost"
          muted={!frost?.first_frost}
          label={
            frost?.first_frost
              ? `median first frost · earliest ${shortDate(frost.first_frost.earliest)}`
              : "median first frost"
          }
        />
        <Pulse
          value={frost?.worst_night ? `${Math.round(frost.worst_night.low_ground_f)}°F` : "—"}
          tone="frost"
          muted={!frost?.worst_night}
          label={
            frost?.worst_night
              ? `coldest ground, ${shortDate(frost.worst_night.date)} — forecast says ${Math.round(frost.worst_night.forecast_low_f)}°F`
              : "coldest ground in the outlook"
          }
        />
      </div>

      {/* ── The spread. This is the product. ──────────────────────────── */}
      {g && (
        <div className="mb-5 flex flex-wrap items-center gap-3.5 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-3.5 py-2.5 text-[13px]">
          <span>
            <b className="figure text-[17px]">{Math.round(g.spread).toLocaleString()} GDD</b>{" "}
            {g.spread > 0 ? (
              <>between the coolest and warmest ground on this block ({Math.round(g.min).toLocaleString()}–{Math.round(g.max).toLocaleString()})</>
            ) : (
              <>of variation — this ground is flat enough that every sample reads alike</>
            )}
          </span>
          <span className="data ml-auto text-right text-[10px] text-ink-soft">
            {data?.sources?.map((s) => `${s.name.replace(/^Open-Meteo /, "")} ${Math.round(s.resolution_m / (s.resolution_m >= 1000 ? 1000 : 1))}${s.resolution_m >= 1000 ? " km" : " m"}`).join(" · ")}
            <br />
            {data?.across_region.terrain_correction === "applied"
              ? "lapse + cold-air drainage"
              : "terrain correction unavailable"}
          </span>
        </div>
      )}

      <h2 className="figure mt-5 mb-2.5 flex items-baseline gap-2.5 text-[18px] font-semibold">
        Season heat curve
        <Provenance tool="goodearth_gdd_season_curve" at={ranAt} onCost={onCost} />
      </h2>

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel p-8 text-center text-[13px] text-ink-soft">
          Reading the season for {region.name}…
        </div>
      ) : data ? (
        <SeasonChart data={data} frostDayIndex={frostIndex(data, frost)} />
      ) : null}

      {data && (
        <p className="data mt-2 text-[10.5px] text-ink-soft">
          {data.region.sample_count} sample points over {data.region.area_km2.toFixed(1)} km² ·{" "}
          {data.across_region.archive_cells_fetched} archive cell
          {data.across_region.archive_cells_fetched === 1 ? "" : "s"} ·{" "}
          {data.projection?.note}
        </p>
      )}

      {frost && (
        <>
          <h2 className="figure mt-6 mb-2.5 flex items-baseline gap-2.5 text-[18px] font-semibold">
            React
            <Provenance tool="goodearth_frost_window" at={frostAt} onCost={onCost} />
          </h2>
          <FrostCard data={frost} />
        </>
      )}

      {soil && (
        <>
          {!frost && <h2 className="figure mt-6 mb-2.5 text-[18px] font-semibold">React</h2>}
          <div className="flex items-baseline gap-2.5">
            <Provenance tool="goodearth_soil_temp_projection" at={soilAt} onCost={onCost} />
          </div>
          <SoilCard data={soil} />
        </>
      )}

      <div className="mt-6 rounded-md border border-dashed border-rule bg-panel/60 p-4 text-[13px] text-ink-soft">
        <span className="figure text-[15px] text-ink">Still to come on this page</span>
        <p className="mt-1 leading-relaxed">
          The map view and field reports are what remain. Field reports are the
          interesting one: they feed the calibration loop, which is how this
          block learns its own microclimate rather than borrowing the region's.
        </p>
      </div>
    </>
  );
}

function Pulse({ value, unit, label, tone, muted }: {
  value: string; unit?: string; label: string;
  tone?: "growth" | "frost"; muted?: boolean;
}) {
  const color = tone === "growth" ? "text-growth" : tone === "frost" ? "text-frost" : "";
  return (
    <div className={`border-l border-rule px-3.5 pt-3 pb-3.5 first:border-l-0 first:pl-0 md:[&:nth-child(3)]:border-l ${muted ? "opacity-45" : ""}`}>
      <div className={`figure text-[clamp(20px,2.4vw,28px)] leading-tight ${color}`}>
        {value}
        {unit && <small className="ml-1 text-[0.55em] font-normal text-ink-soft">{unit}</small>}
      </div>
      <div className="mt-0.5 text-[11.5px] text-ink-soft">{label}</div>
    </div>
  );
}

/// Where the median first frost falls along the curve's own day axis, so the
/// chart can draw the line in the same coordinate space as the data. Null when
/// the date sits outside the plotted range — better no line than one clamped
/// to an edge, which would read as a frost date that is not real.
function frostIndex(curve: SeasonCurveResult, frost: FrostWindowResult | null): number | null {
  const median = frost?.first_frost?.median;
  const dates = curve.curve?.dates;
  if (!median || !dates?.length) return null;
  const start = new Date(dates[0] + "T12:00:00").getTime();
  const idx = Math.round((new Date(median + "T12:00:00").getTime() - start) / 86_400_000);
  const total = dates.length + (curve.forecast?.cumulative.length ?? 0) + (curve.projection?.cumulative.length ?? 0);
  return idx >= 0 && idx < total ? idx : null;
}

const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => String(Math.round(n)).split("").map((c) => SUBS[+c] ?? c).join("");
const fmt = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
