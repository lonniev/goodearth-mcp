// Almanac — what the season is doing, beside what it is doing to the plants.
//
// Degree days are the crop's clock. This is everything else a grower reads a
// season by: how warm, how humid, how wet, how much sun, and where the sun and
// moon are in their own cycles.
//
// Each measure gets its own small chart rather than one crowded overlay,
// because degrees, inches and hours cannot share an axis honestly. The shape
// is identical across them so the eye learns it once.

import { useUnits } from "../components/Units";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MeasureChart from "../components/MeasureChart";
import Provenance from "../components/Provenance";
import RadarMap from "../components/RadarMap";
import { readingTime } from "../lib/readingTime";
import { trendLift } from "../lib/trend";
import { QuoteScroller } from "@tollbooth-dpyc/web/react";
import { AGRARIAN_QUOTES, AGRARIAN_SOURCE, quoteStyles } from "../lib/quotes";
import { type AlmanacResult, type MeasureKey } from "../lib/mcp";
import { loadAlmanac } from "../lib/pageLoads";
import type { SavedRegion } from "../lib/regions";
import { dropIndex, mergeOrder, moveItem } from "../lib/reorder";
import { ChartFrame } from "../components/ui";
import { useShare } from "../components/Share";
import { almanacSheet } from "../lib/exports";

const SERIES: { key: MeasureKey; label: string; emoji: string; color?: string }[] = [
  { key: "temp_max",  label: "Daily high",  emoji: "🌡️" },
  { key: "temp_min",  label: "Daily low",   emoji: "🌙", color: "var(--color-frost)" },
  { key: "dew_point", label: "Dew point",   emoji: "💧", color: "var(--color-frost)" },
  { key: "precip",    label: "Rain",        emoji: "🌧️", color: "var(--color-frost)" },
  { key: "sunshine",  label: "Sunshine",    emoji: "☀️", color: "var(--color-honey)" },
  { key: "daylight",  label: "Day length",  emoji: "🌅", color: "var(--color-honey)" },
  { key: "wind_max",  label: "Wind",        emoji: "🌬️" },
  // Beside the dew point on purpose. The dew point is how much water the air
  // holds; this is how close it is to holding all it can, which is what
  // decides whether a leaf stays wet — and the same water reads 90% at dawn
  // and 50% by noon because the air warmed, not because anything dried.
  { key: "humidity",  label: "Humidity",    emoji: "💦", color: "var(--color-frost)" },
];

const time = (iso: string | null) => (iso ? iso.slice(11, 16) : "—");
const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function Almanac({
  region, onCost, chartOrder, onChartOrder,
}: {
  region: SavedRegion;
  onCost: (sats: number) => void;
  /// Saved measure keys, left to right. Empty means the order they ship in.
  chartOrder: string[];
  onChartOrder: (order: string[]) => void;
}) {
  const u = useUnits();
  const [data, setData] = useState<AlmanacResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [shown, setShown] = useState<Set<MeasureKey>>(
    () => new Set<MeasureKey>(["temp_max", "dew_point", "precip", "sunshine"]),
  );

  /// The chiclets in their arranged order, which is also the order the charts
  /// stack in. `mergeOrder` is what keeps a measure added after somebody
  /// arranged their row — humidity, say — from vanishing for them.
  const ordered = mergeOrder(chartOrder, SERIES.map((x) => x.key))
    .map((k) => SERIES.find((x) => x.key === k))
    .filter((x): x is (typeof SERIES)[number] => !!x);

  /// The drag. A press that never travels is a tap and still toggles the
  /// chiclet — the row keeps doing what it always did, and rearranging is
  /// something the same gesture grows into.
  const [dragging, setDragging] = useState<number | null>(null);
  const row = useRef<HTMLDivElement | null>(null);
  const grab = useRef<{ index: number; x: number; moved: boolean } | null>(null);

  const centersOf = () => {
    const kids = Array.from(row.current?.children ?? []) as HTMLElement[];
    return kids.map((el) => el.getBoundingClientRect())
      .map((r) => r.left + r.width / 2);
  };

  function onDown(e: React.PointerEvent, index: number) {
    grab.current = { index, x: e.clientX, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    const g = grab.current;
    if (!g) return;
    // A few pixels of slack, so a tap with a shaky hand is still a tap.
    if (!g.moved && Math.abs(e.clientX - g.x) < 6) return;
    g.moved = true;
    setDragging(g.index);
    const to = dropIndex(centersOf(), e.clientX);
    if (to !== g.index) {
      onChartOrder(moveItem(ordered.map((x) => x.key), g.index, to));
      g.index = to;
      setDragging(to);
    }
  }

  function onUp(e: React.PointerEvent, key: MeasureKey) {
    const g = grab.current;
    grab.current = null;
    setDragging(null);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!g?.moved) toggle(key);
  }

  const run = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const r = await loadAlmanac(region);
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
  /// The ten days ahead against the record, through the share button in the
  /// top bar. Every number is already on this page, so it asks for nothing.
  useShare(useMemo(() => (data ? almanacSheet(data, region.name, u.unit) : null), [data, region.name, u.unit]));
  /// The rain on the radar, on request and remembered on this device: a map
  /// on every visit would push the fortnight and the charts down the page.
  const [radar, setRadar] = useState(() => { try { return localStorage.getItem(RADAR_KEY) === "1"; } catch { return false; } });
  const toggleRadar = () => setRadar((v) => { try { localStorage.setItem(RADAR_KEY, v ? "0" : "1"); } catch { /* a private window */ } return !v; });

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Almanac</h1>
        <span className="text-[13px] text-ink-soft">{region.name}</span>
        <button onClick={toggleRadar} aria-pressed={radar}
          title="Rain on the radar"
          aria-label="Rain on the radar"
          className={`ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center self-center rounded border text-[18px] ${
            radar ? "border-ink bg-ink" : "border-rule active:bg-band"}`}>
          🌧️
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">{error}</div>
      )}

      {/* ── Today ──────────────────────────────────────────────────────── */}
      {c && (
        <div className="mb-4 rounded-md border border-rule bg-panel px-4 py-3.5">
          {/* Eight readings, eight equal cells, one anatomy each. Today's sky
              is a reading like the rest, so it takes the same cell rather than
              a wider one — the eye compares them across a single axis. */}
          <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-8">
            <Stat emoji={c.sky.emoji} label={c.sky.label}
              value={`${c.high_f != null ? Math.round(u.temp(c.high_f)) : "—"}° / ${c.low_f != null ? Math.round(u.temp(c.low_f)) : "—"}°`} />
            <Stat emoji="💧" label="dew point" value={c.dew_point_f != null ? u.showTemp(c.dew_point_f) : "—"} />
            <Stat emoji={c.wind.emoji} label="wind"
              value={c.wind.speed_mph != null ? `${Math.round(c.wind.speed_mph)} mph` : "—"}
              sub={c.wind.from ? `${c.wind.arrow ?? ""} from ${c.wind.from}` : undefined} />
            <Stat emoji="🌧️" label="chance of rain"
              value={c.precip_chance_pct != null ? `${Math.round(c.precip_chance_pct)}%` : "—"} />
            <Stat emoji="🌅" label="sun"
              value={`${time(c.sunrise)}–${time(c.sunset)}`}
              sub={c.daylight_hours != null ? `${c.daylight_hours.toFixed(1)} h of daylight` : undefined} />
            <Stat emoji="☀️" label="sunshine"
              value={c.sunshine_hours != null ? `${c.sunshine_hours.toFixed(1)} h` : "—"}
              sub={c.sunshine_fraction != null ? `${Math.round(c.sunshine_fraction * 100)}% of daylight` : undefined} />
            {/* The daily swing in day length was a sentence that ended in a
                line telling the grower why to care. The figure is the useful
                half; it reads as a reading like its neighbours. */}
            <Stat emoji="⏳" label="day length"
              value={data?.sun.daylight_change_min_per_day != null
                ? `${data.sun.daylight_change_min_per_day > 0 ? "+" : "−"}${Math.abs(data.sun.daylight_change_min_per_day).toFixed(1)} min`
                : "—"}
              sub="a day" />
            {data?.moon && (
              <Stat emoji={data.moon.emoji} label={data.moon.name.toLowerCase()}
                value={`${Math.round(data.moon.illumination * 100)}% lit`}
                sub={data.moon.next_full ? `full ${day(data.moon.next_full)}` : undefined} />
            )}
          </div>
        </div>
      )}

      {/* ── The rain, now ──────────────────────────────────────────────── */}
      {radar && <RadarMap region={region} />}

      {/* ── The fortnight ──────────────────────────────────────────────── */}
      {data && data.upcoming.length > 0 && (
        /* A fixed-width scroller left the right third of a wide screen empty
           while hiding days off the edge. A grid spends the whole width and
           wraps instead of scrolling, so the fortnight is all on screen. */
        <div className="mb-5 grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:grid-cols-[repeat(14,minmax(0,1fr))]">
          {/* Each card rides a few pixels higher on a warmer day, so the
              fortnight's warming or cooling shows before a number is read.
              A transform, not a margin: the grid rows keep their height. */}
          {(() => {
            const lift = trendLift(data.upcoming.map((d) =>
              d.high_f != null && d.low_f != null ? (d.high_f + d.low_f) / 2 : null), TREND_PX);
            return data.upcoming.map((u, i) => (
            <div key={u.date} style={{ transform: `translateY(${-lift[i]}px)` }}
              className="flex flex-col items-center gap-0.5 rounded-md border border-rule bg-panel px-1 py-2.5">
              <span className="data text-[10.5px] text-ink-soft">
                {new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-[24px] leading-none">{u.sky.emoji}</span>
              <span className="figure text-[15px]">
                {u.high_f != null ? Math.round(u.high_f) : "—"}°
                <span className="text-ink-soft">/{u.low_f != null ? Math.round(u.low_f) : "—"}°</span>
              </span>
              {/* The rain row is always drawn, blank when there is no chance
                  of any. It used to be omitted, which lifted every row below
                  it — so a dry Monday put its humidity where its neighbours
                  put their rain, and fourteen cells stopped lining up. A
                  reserved line costs nothing and keeps the strip readable
                  across. */}
              <span className="data text-[10.5px] text-frost">
                {u.precip_chance_pct ? `${Math.round(u.precip_chance_pct)}%` : "\u00A0"}
              </span>
              <span className="data text-[10.5px] text-ink-soft"
                title="Average relative humidity">
                {u.humidity_pct != null ? `💦${Math.round(u.humidity_pct)}%` : "\u00A0"}
              </span>
              <span className="data text-[10.5px] text-ink-soft">{u.wind.emoji}{u.wind.from ?? ""}</span>
            </div>
            ));
          })()}
        </div>
      )}

      {/* ── Measures ───────────────────────────────────────────────────── */}
      <h2 className="figure mb-2 flex items-baseline gap-2.5 text-[18px] font-semibold">
        The season so far
        <Provenance tool="goodearth_almanac" at={ranAt} onCost={onCost} from={readingTime(data)} />
      </h2>

      {/* Left to right here is top to bottom below. Drag one along the row to
          move its chart up or down the page; a tap still just shows or hides
          it. The arrangement is remembered on this device, beside the season
          and the units. */}
      <div ref={row} className="mb-1.5 flex flex-wrap gap-1.5 select-none">
        {ordered.map((s, i) => (
          <button key={s.key}
            onPointerDown={(e) => onDown(e, i)}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(e, s.key)}
            onPointerCancel={() => { grab.current = null; setDragging(null); }}
            title={`${s.label} — drag to move its chart up or down`}
            className={`min-h-11 cursor-grab touch-none rounded-full border px-3.5 text-[12.5px] ${
              dragging === i ? "scale-105 cursor-grabbing shadow-md" : ""} ${
              shown.has(s.key) ? "border-ink bg-ink text-paper" : "border-rule active:bg-band"}`}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>
      <p className="data mb-3 text-[10.5px] text-ink-soft">
        Tap to show or hide · drag to reorder
      </p>

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller quotes={AGRARIAN_QUOTES} source={AGRARIAN_SOURCE} heading="Reading the season" intervalMs={6500} classNames={quoteStyles} />
        </div>
      ) : data ? (
        <div className="space-y-3">
          {ordered.filter((s) => shown.has(s.key)).map((s) => (
            <ChartFrame key={s.key} label={s.label}>
              <MeasureChart measure={data.measures[s.key]}
                dates={data.dates} forecastDates={data.forecast_dates}
                label={s.label} emoji={s.emoji} color={s.color} />
            </ChartFrame>
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

/// How far the warmest day in the fortnight rides above the coolest. Enough to
/// see a trend across fourteen cards, little enough to keep the strip compact.
const TREND_PX = 10;

/// Whether the radar map is open, kept on this device beside the chart order.
const RADAR_KEY = "goodearth.almanac.radar";

function Stat({ emoji, label, value, sub }: {
  emoji: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="px-1 text-center">
      <div className="text-[26px] leading-none">{emoji}</div>
      <b className="figure mt-1.5 block text-[19px] leading-tight">{value}</b>
      <div className="mt-0.5 text-[12px] leading-snug text-ink-soft">{label}</div>
      {sub && <div className="data mt-0.5 text-[10.5px] leading-snug text-ink-soft">{sub}</div>}
    </div>
  );
}
