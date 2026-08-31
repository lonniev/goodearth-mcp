// Almanac — what the season is doing, beside what it is doing to the plants.
//
// Degree days are the crop's clock. This is everything else a grower reads a
// season by: how warm, how humid, how wet, how much sun, and where the sun and
// moon are in their own cycles.
//
// Each measure gets its own small chart rather than one crowded overlay,
// because degrees, inches and hours cannot share an axis honestly. The shape
// is identical across them so the eye learns it once.

import { useCallback, useEffect, useState } from "react";
import MeasureChart from "../components/MeasureChart";
import Provenance from "../components/Provenance";
import { almanacFor, type AlmanacResult, type MeasureKey } from "../lib/mcp";
import type { SavedRegion } from "../lib/regions";

const SERIES: { key: MeasureKey; label: string; emoji: string; color?: string }[] = [
  { key: "temp_max",  label: "Daily high",  emoji: "🌡️" },
  { key: "temp_min",  label: "Daily low",   emoji: "🌙", color: "var(--color-frost)" },
  { key: "dew_point", label: "Dew point",   emoji: "💧", color: "var(--color-frost)" },
  { key: "precip",    label: "Rain",        emoji: "🌧️", color: "var(--color-frost)" },
  { key: "sunshine",  label: "Sunshine",    emoji: "☀️", color: "var(--color-honey)" },
  { key: "daylight",  label: "Day length",  emoji: "🌅", color: "var(--color-honey)" },
  { key: "wind_max",  label: "Wind",        emoji: "🌬️" },
];

const time = (iso: string | null) => (iso ? iso.slice(11, 16) : "—");
const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function Almanac({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  const [data, setData] = useState<AlmanacResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [shown, setShown] = useState<Set<MeasureKey>>(
    () => new Set<MeasureKey>(["temp_max", "dew_point", "precip", "sunshine"]),
  );

  const run = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const r = await almanacFor(region.region);
      if (!r.success) { setError(r.error || "The almanac could not be read."); return; }
      setData(r); setRanAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(); }, [run]);

  const toggle = (k: MeasureKey) =>
    setShown((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  const c = data?.conditions;

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Almanac</h1>
        <span className="text-[13px] text-ink-soft">{region.name}</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">{error}</div>
      )}

      {/* ── Today ──────────────────────────────────────────────────────── */}
      {c && (
        <div className="mb-4 rounded-md border border-rule bg-panel px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-[34px] leading-none">{c.sky.emoji}</span>
            <div>
              <div className="figure text-[20px]">
                {c.high_f != null && Math.round(c.high_f)}° / {c.low_f != null && Math.round(c.low_f)}°
              </div>
              <div className="text-[12.5px] text-ink-soft">{c.sky.label}</div>
            </div>
            <Stat emoji="💧" label="dew point" value={c.dew_point_f != null ? `${Math.round(c.dew_point_f)}°F` : "—"} />
            <Stat emoji={c.wind.emoji} label="wind"
              value={c.wind.speed_mph != null
                ? `${Math.round(c.wind.speed_mph)} mph ${c.wind.arrow ?? ""} ${c.wind.from ?? ""}`
                : "—"} />
            <Stat emoji="🌧️" label="chance of rain"
              value={c.precip_chance_pct != null ? `${Math.round(c.precip_chance_pct)}%` : "—"} />
            <Stat emoji="🌅" label="sun"
              value={`${time(c.sunrise)}–${time(c.sunset)}`}
              sub={c.daylight_hours != null ? `${c.daylight_hours.toFixed(1)} h` : undefined} />
            <Stat emoji="☀️" label="sunshine"
              value={c.sunshine_hours != null ? `${c.sunshine_hours.toFixed(1)} h` : "—"}
              sub={c.sunshine_fraction != null ? `${Math.round(c.sunshine_fraction * 100)}% of daylight` : undefined} />
            {data?.moon && (
              <Stat emoji={data.moon.emoji} label={data.moon.name.toLowerCase()}
                value={`${Math.round(data.moon.illumination * 100)}% lit`}
                sub={data.moon.next_full ? `full ${day(data.moon.next_full)}` : undefined} />
            )}
          </div>

          {data?.sun.daylight_change_min_per_day != null && (
            <p className="mt-2.5 text-[12.5px] text-ink-soft">
              Day length is{" "}
              <b className="text-ink">
                {data.sun.daylight_change_min_per_day > 0 ? "gaining" : "losing"}{" "}
                {Math.abs(data.sun.daylight_change_min_per_day).toFixed(1)} minutes a day
              </b>{" "}
              — the clock a short-day variety actually reads.
            </p>
          )}
        </div>
      )}

      {/* ── The fortnight ──────────────────────────────────────────────── */}
      {data && data.upcoming.length > 0 && (
        <div className="mb-5 flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
          {data.upcoming.map((u) => (
            <div key={u.date}
              className="flex w-[74px] shrink-0 flex-col items-center gap-0.5 rounded-md border border-rule bg-panel py-2">
              <span className="data text-[10px] text-ink-soft">
                {new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-[22px] leading-none">{u.sky.emoji}</span>
              <span className="figure text-[13px]">
                {u.high_f != null ? Math.round(u.high_f) : "—"}°
                <span className="text-ink-soft">/{u.low_f != null ? Math.round(u.low_f) : "—"}°</span>
              </span>
              {!!u.precip_chance_pct && (
                <span className="data text-[10px] text-frost">{Math.round(u.precip_chance_pct)}%</span>
              )}
              <span className="data text-[10px] text-ink-soft">{u.wind.emoji}{u.wind.from ?? ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Measures ───────────────────────────────────────────────────── */}
      <h2 className="figure mb-2 flex items-baseline gap-2.5 text-[18px] font-semibold">
        The season so far
        <Provenance tool="goodearth_almanac" at={ranAt} onCost={onCost} />
      </h2>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SERIES.map((s) => (
          <button key={s.key} onClick={() => toggle(s.key)}
            className={`min-h-11 rounded-full border px-3.5 text-[12.5px] ${
              shown.has(s.key) ? "border-ink bg-ink text-paper" : "border-rule active:bg-band"}`}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel p-8 text-center text-[13px] text-ink-soft">
          Reading the season…
        </div>
      ) : data ? (
        <div className="space-y-3">
          {SERIES.filter((s) => shown.has(s.key)).map((s) => (
            <MeasureChart key={s.key} measure={data.measures[s.key]}
              dates={data.dates} forecastDates={data.forecast_dates}
              label={s.label} emoji={s.emoji} color={s.color} />
          ))}
          <p className="data text-[10.5px] text-ink-soft">
            Grey band is the range across the last {data.normals_span_years} seasons ·
            solid is this season · dashed is the forecast
          </p>
        </div>
      ) : null}
    </>
  );
}

function Stat({ emoji, label, value, sub }: {
  emoji: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="min-w-[92px]">
      <div className="text-[13px]">
        <span className="mr-1">{emoji}</span>
        <b className="figure text-[15px]">{value}</b>
      </div>
      <div className="text-[11px] text-ink-soft">{label}</div>
      {sub && <div className="data text-[10px] text-ink-soft">{sub}</div>}
    </div>
  );
}
