// Heat Ledger — the season-curve view.
//
// Everything on this page comes from one call to goodearth_gdd_season_curve.
// Where a figure would need a tool that has not shipped, the slot says so
// plainly instead of showing a plausible number: a grower who plans around a
// fabricated frost date loses a crop.

import { useCallback, useEffect, useState } from "react";
import SeasonChart from "../components/SeasonChart";
import FrostCard from "../components/FrostCard";
import EventDetail from "../components/EventDetail";
import SoilCard from "../components/SoilCard";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import { buildFlags, type LedgerFlag } from "../lib/ledgerFlags";
import { listPlantings } from "../lib/plantings";
import { listPests } from "../lib/pestModels";
import { listWildlife } from "../lib/wildlifeModels";
import { frostWindow, gddSeasonCurve, soilTempProjection, type FrostWindowResult, type SeasonCurveResult, type SoilWindowResult } from "../lib/mcp";
import type { SavedRegion } from "../lib/regions";

interface Props {
  region: SavedRegion;
  onMeasured: (areaHa: number, samples: number) => void;
  onCost: (sats: number) => void;
  /// Lifted so the hive in the corner can read the same night the frost card
  /// does — the hive is an instrument, and it must not disagree with the page.
  onFrost?: (f: FrostWindowResult | null) => void;
  /// The ledger raises questions the other views answer; it should be able to
  /// hand the reader straight to them.
  onView?: (v: "map" | "almanac" | "crops" | "pests" | "wildlife" | "reports") => void;
}

export default function HeatLedger({ region, onMeasured, onCost, onFrost, onView }: Props) {
  const [data, setData] = useState<SeasonCurveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [frost, setFrost] = useState<FrostWindowResult | null>(null);
  const [frostAt, setFrostAt] = useState<Date | null>(null);
  const [soil, setSoil] = useState<SoilWindowResult | null>(null);
  const [soilAt, setSoilAt] = useState<Date | null>(null);
  const [showFlags, setShowFlags] = useState(true);
  const [openFlag, setOpenFlag] = useState<LedgerFlag | null>(null);
  const [showGround, setShowGround] = useState(true);

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

  // Every threshold the grower has entered is a GDD number, and where it meets
  // this curve is a date. The curve is already paid for, so the whole calendar
  // comes free — no second call, no second fare.
  const flags: LedgerFlag[] = data
    ? buildFlags(data, listPlantings(region.id), listPests(region.id), listWildlife(region.id))
    : [];

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
          emoji="🌡️"
          value={g ? Math.round(g.mean).toLocaleString() : busy ? "…" : "—"}
          unit={data ? `GDD${sub(data.base_temp_f)}` : ""}
          label="accumulated across the block"
          gauge={heatGauge(data)}
        />
        <Pulse
          emoji={ahead == null ? "📊" : ahead >= 0 ? "📈" : "📉"}
          value={ahead == null ? "—" : `${ahead >= 0 ? "+" : ""}${Math.round(ahead)}`}
          tone={ahead == null ? undefined : ahead >= 0 ? "growth" : "frost"}
          label={
            data?.normals
              ? `${ahead == null ? "" : ahead >= 0 ? "ahead of" : "behind"} the last ${data.normals.span_years} seasons`
              : "against recent seasons"
          }
        />
        <Pulse
          emoji="❄️"
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
          emoji={frost?.worst_night && frost.worst_night.level !== "clear" ? "🥶" : "🌙"}
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
        <div className="mb-5 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[17px] leading-none">⛰️</span>
            <b className="figure text-[19px]">{Math.round(g.spread).toLocaleString()} GDD</b>
            <span className="text-[13px]">
              {g.spread > 0
                ? "between the coolest and warmest ground on this block"
                : "of variation — this ground is flat enough that every sample reads alike"}
            </span>
            {daysApart(g, data) != null && (
              <span className="rounded-full bg-growth/12 px-2.5 py-1 text-[11.5px] font-semibold text-growth">
                ≈ {daysApart(g, data)} days apart
              </span>
            )}
          </div>

          {/* The block, drawn. A sentence about min and max is a fact; this is
              the same fact as a picture of the ground it came from. */}
          {g.spread > 0 && (
            <div className="mt-3">
              <div className="relative h-2 rounded-full bg-gradient-to-r from-frost/35 via-band to-growth/45">
                <span className="absolute -top-0.5 h-3 w-[3px] rounded bg-ink"
                  style={{ left: `calc(${((g.mean - g.min) / (g.max - g.min)) * 100}% - 1.5px)` }} />
              </div>
              <div className="data mt-1 flex justify-between text-[10px] text-ink-soft">
                <span>🥶 hollow {Math.round(g.min).toLocaleString()}</span>
                <span>mean {Math.round(g.mean).toLocaleString()}</span>
                <span>{Math.round(g.max).toLocaleString()} bench ☀️</span>
              </div>
            </div>
          )}

          <p className="data mt-2.5 text-[10px] leading-relaxed text-ink-soft">
            {data?.sources?.map((s) => `${s.name.replace(/^Open-Meteo /, "")} ${Math.round(s.resolution_m / (s.resolution_m >= 1000 ? 1000 : 1))}${s.resolution_m >= 1000 ? " km" : " m"}`).join(" · ")}
            {" · "}
            {data?.across_region.terrain_correction === "applied"
              ? "lapse + cold-air drainage"
              : "terrain correction unavailable"}
          </p>
        </div>
      )}

      <h2 className="figure mt-5 mb-2.5 flex flex-wrap items-baseline gap-2.5 text-[18px] font-semibold">
        <span className="mr-0.5">📈</span>Season heat curve
        {flags.length > 0 && (
          <button onClick={() => setShowFlags((v) => !v)}
            className={`min-h-11 rounded-full border px-3.5 text-[12px] font-medium ${
              showFlags ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"}`}>
            {flags.length} of your events
          </button>
        )}
        <button onClick={() => setShowGround((v) => !v)}
          title="Ghost this block's satellite still behind the curve"
          className={`min-h-11 rounded-full border px-3.5 text-[12px] font-medium ${
            showGround ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"}`}>
          🛰️ Ground
        </button>
        <Provenance tool="goodearth_gdd_season_curve" at={ranAt} onCost={onCost} />
      </h2>

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller heading={`Reading the season for ${region.name}`} />
        </div>
      ) : data ? (
        <SeasonChart data={data} frostDayIndex={frostIndex(data, frost)}
          flags={showFlags ? flags : []} onFlag={setOpenFlag} showGround={showGround} />
      ) : null}

      {data && flags.length > 0 && showFlags && (
        <p className="data mt-2 text-[10.5px] text-ink-soft">
          <span className="text-growth">● crops</span>{" · "}
          <span className="text-honey">● pests</span>{" · "}
          <span className="text-frost">● wildlife</span>
          {" — placed where your own thresholds meet this curve, at no extra cost."}
          {flags.some((f) => f.baseMismatch) &&
            " Dimmed flags count from a different base temperature than this block."}
        </p>
      )}

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
            <span className="mr-0.5">🔔</span>React
            <Provenance tool="goodearth_frost_window" at={frostAt} onCost={onCost} />
          </h2>
          <FrostCard data={frost} />
        </>
      )}

      {soil && (
        <>
          {!frost && <h2 className="figure mt-6 mb-2.5 text-[18px] font-semibold">🔔 React</h2>}
          <div className="flex items-baseline gap-2.5">
            <Provenance tool="goodearth_soil_temp_projection" at={soilAt} onCost={onCost} />
          </div>
          <SoilCard data={soil} />
        </>
      )}

      {/* The ledger is the season's spine; these are its ribs. Naming them
          here beats a rail label alone, because the reason to open one is
          usually a question this page just raised. */}
      {openFlag && data && (
        <EventDetail flag={openFlag} curve={data} onClose={() => setOpenFlag(null)} />
      )}

      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">🧭 From here</h2>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { to: "almanac" as const, emoji: "🌤️", title: "Almanac",
            line: "Rain, dew point, sun and moon — the rest of what the season is doing." },
          { to: "crops" as const, emoji: "🌱", title: "Crops",
            line: "Where each planting stands, and whether it finishes before frost." },
          { to: "pests" as const, emoji: "🐛", title: "Pests",
            line: "Which rows are worth walking this week." },
          { to: "wildlife" as const, emoji: "🦋", title: "Wildlife",
            line: "Robins, woodchucks, geese — the same clocks, other creatures." },
          { to: "reports" as const, emoji: "📓", title: "Field Reports",
            line: "What you saw. Enough of them and this block gets its own calendar." },
          { to: "map" as const, emoji: "🗺️", title: "Map",
            line: "Draw another block, or check the radar." },
        ].map((c) => (
          <button key={c.to} onClick={() => onView?.(c.to)}
            className="rounded-md border border-rule bg-panel px-3.5 py-3 text-left active:border-ink">
            <div className="figure text-[14.5px] font-semibold">
              <span className="mr-1.5">{c.emoji}</span>{c.title}
            </div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{c.line}</p>
          </button>
        ))}
      </div>
    </>
  );
}

function Pulse({ emoji, value, unit, label, tone, muted, gauge }: {
  emoji: string;
  value: string; unit?: string; label: string;
  tone?: "growth" | "frost"; muted?: boolean;
  /// Where this season sits inside the normal range, 0..1. The figure alone
  /// says how much heat; the gauge says whether that is a lot.
  gauge?: { pos: number; lo: string; hi: string } | null;
}) {
  const color = tone === "growth" ? "text-growth" : tone === "frost" ? "text-frost" : "";
  const bar = tone === "frost" ? "bg-frost" : "bg-growth";
  return (
    <div className={`border-l border-rule px-3.5 pt-3 pb-3.5 first:border-l-0 first:pl-0 md:[&:nth-child(3)]:border-l ${muted ? "opacity-45" : ""}`}>
      <div className="mb-0.5 text-[15px] leading-none">{emoji}</div>
      <div className={`figure text-[clamp(20px,2.4vw,28px)] leading-tight ${color}`}>
        {value}
        {unit && <small className="ml-1 text-[0.55em] font-normal text-ink-soft">{unit}</small>}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">{label}</div>
      {gauge && (
        <div className="mt-2">
          <div className="relative h-[5px] rounded-full bg-band">
            <span className={`absolute top-1/2 h-[11px] w-[3px] -translate-y-1/2 rounded-full ${bar}`}
              style={{ left: `calc(${Math.min(Math.max(gauge.pos, 0), 1) * 100}% - 1.5px)` }} />
          </div>
          <div className="data mt-0.5 flex justify-between text-[9.5px] text-ink-soft">
            <span>{gauge.lo}</span><span>{gauge.hi}</span>
          </div>
        </div>
      )}
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

/// Where this season sits inside the ten-season range, as a 0..1 position.
/// The number says how much heat; this says whether that is a lot.
function heatGauge(data: SeasonCurveResult | null) {
  const t = data?.normals?.today;
  const mean = data?.accumulated_gdd?.mean;
  if (!t || mean == null || t.max <= t.min) return null;
  return {
    pos: (mean - t.min) / (t.max - t.min),
    lo: `coolest ${Math.round(t.min).toLocaleString()}`,
    hi: `${Math.round(t.max).toLocaleString()} warmest`,
  };
}

/// The spread, restated as the thing a grower plans around: how far apart the
/// two ends of the block are in crop timing.
function daysApart(
  g: { spread: number },
  data: SeasonCurveResult | null,
): number | null {
  const mean = data?.curve?.cumulative_mean;
  if (!mean || mean.length < 15 || g.spread <= 0) return null;
  const recent = (mean[mean.length - 1] - mean[mean.length - 15]) / 14;
  if (recent <= 0) return null;
  const days = Math.round(g.spread / recent);
  return days >= 1 ? days : null;
}

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => String(Math.round(n)).split("").map((c) => SUBS[+c] ?? c).join("");
const fmt = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
