// Heat Ledger — the season-curve view.
//
// Everything on this page comes from one call to goodearth_gdd_season_curve.
// Where a figure would need a tool that has not shipped, the slot says so
// plainly instead of showing a plausible number: a grower who plans around a
// fabricated frost date loses a crop.

import { useUnits } from "../components/Units";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import SeasonChart from "../components/SeasonChart";
import { ChartFrame } from "../components/ui";
import FrostCard from "../components/FrostCard";
import EventDetail from "../components/EventDetail";
import SoilCard from "../components/SoilCard";
import DiseaseCard from "../components/DiseaseCard";
import { bands } from "../lib/diseaseBands";
import { dryingLine } from "../lib/dryingLine";
import PulseTile, { type Gauge } from "../components/PulseTile";
import DryingStrip from "../components/DryingStrip";
import WaterStrip from "../components/WaterStrip";
import { waterLine } from "../lib/waterLine";
import { FACE, faceWord, onFace, stormWords, tendencyArrow } from "../lib/storm";
import Term from "../components/Term";
import Provenance from "../components/Provenance";
import { QuoteScroller } from "@tollbooth-dpyc/web/react";
import { AGRARIAN_QUOTES, AGRARIAN_SOURCE, quoteStyles } from "../lib/quotes";
import { buildFlags, partsOf, rollUpFlags, taskFlags, type LedgerFlag } from "../lib/ledgerFlags";
import { readingTime } from "../lib/readingTime";
import { findEvent, MIN_QUERY } from "../lib/findEvent";
import { plantingCodec, type Planting } from "../lib/plantings";
import { pestCodec, type SavedPest } from "../lib/pestModels";
import { wildlifeCodec, type SavedWildlife } from "../lib/wildlifeModels";
import { useBlockItems } from "../lib/blockItems";
import { useShare } from "../components/Share";
import { ledgerSheet } from "../lib/exports";
import { type AlmanacResult, type MeasureKey,
  diseaseRisk, dryingWindow, frostWindow, soilTempProjection, taskList, waterBalance, type WaterBalanceResult, type PlotRef, type TaskRow, type DiseaseRiskResult, type DryingWindowResult, type FrostWindowResult, type SeasonCurveResult, type SoilWindowResult } from "../lib/mcp";
import type { SavedRegion } from "../lib/regions";
import { loadAlmanac, loadLedger } from "../lib/pageLoads";
import { useTour } from "@tollbooth-dpyc/web/react";
import { tour } from "../lib/tour/targets";
import { languageLocale } from "@tollbooth-dpyc/web";
import { tr, useT, type Translate } from "../i18n";
import type { MessageKey } from "../i18n/en";

/// Stable, so the record hooks do not refetch on every render.
const ROLL_UP = { includeInside: true } as const;

interface Props {
  region: SavedRegion;
  onCost: (sats: number) => void;
  /// Lifted so the hive in the corner can read the same night the frost card
  /// does — the hive is an instrument, and it must not disagree with the page.
  onFrost?: (f: FrostWindowResult | null) => void;
  /// The ledger raises questions the other views answer; it should be able to
  /// hand the reader straight to them.
  onView?: (v: "plots" | "almanac" | "crops" | "pests" | "wildlife" | "reports" | "references") => void;
}

export default function HeatLedger({ region, onCost, onFrost, onView }: Props) {
  const u = useUnits();
  const t = useT();
  const [data, setData] = useState<SeasonCurveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The flags read the grower's record, not this browser — the same rows the
  // Crops, Pests and Wildlife pages show.
  //
  // Rolled up: a plot shows what is recorded on the plots inside it too, so a
  // farm of beds reads as the farm.
  const plantingRows = useBlockItems<Planting>(region.id, "planting", plantingCodec, undefined, ROLL_UP);
  const pestRows = useBlockItems<SavedPest>(region.id, "pest", pestCodec, undefined, ROLL_UP);
  const wildlifeRows = useBlockItems<SavedWildlife>(region.id, "wildlife", wildlifeCodec, undefined, ROLL_UP);
  const plantings = plantingRows.items;

  // The grower's own dated work belongs on the timeline too: a task sits on
  // the day it is due, whatever the heat did that day. Fetched here rather
  // than derived from the record hooks because tasks are their own store.
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [taskParts, setTaskParts] = useState<PlotRef[]>([]);
  useEffect(() => {
    let live = true;
    void taskList(region.id, { timeframe: "all", page_size: 200, include_inside: true })
      .then((r) => {
        if (live && r?.success) { setTasks(r.rows ?? []); setTaskParts(r.inside ?? []); }
      })
      .catch(() => { /* the chart is still worth drawing without them */ });
    return () => { live = false; };
  }, [region.id]);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [frost, setFrost] = useState<FrostWindowResult | null>(null);
  const frostTile = firstFrost(frost);
  const [frostAt, setFrostAt] = useState<Date | null>(null);
  const [soil, setSoil] = useState<SoilWindowResult | null>(null);
  const [soilAt, setSoilAt] = useState<Date | null>(null);
  const [sick, setSick] = useState<DiseaseRiskResult | null>(null);
  const [sickAt, setSickAt] = useState<Date | null>(null);
  const [showFlags, setShowFlags] = useState(true);
  // The tour's "tap a mark" step needs the marks on the chart.
  useTour("ledger", { actions: { "show-events": () => setShowFlags(true) } });
  const [openFlag, setOpenFlag] = useState<LedgerFlag | null>(null);
  const [showGround, setShowGround] = useState(true);
  const [almanac, setAlmanac] = useState<AlmanacResult | null>(null);
  const [almanacAt, setAlmanacAt] = useState<Date | null>(null);
  const [wx, setWx] = useState(0);          // 0 = off; cycles through WEATHER
  const [wxBusy, setWxBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const r = await loadLedger(region);
      if (!r.success) { setError(r.error || t("views.heatLedger.err.answer")); return; }
      setData(r);
      setRanAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [region, t]);

  const runFrost = useCallback(async () => {
    try {
      const f = await frostWindow(region.id);
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
      const s = await soilTempProjection(region.id, 60, "cooling");
      if (!s.success) { setSoil(null); return; }
      setSoil(s); setSoilAt(new Date());
    } catch { setSoil(null); }
  }, [region]);

  const runDisease = useCallback(async () => {
    try {
      // Every model, because "what is my disease risk" without naming one is
      // the ordinary question. One call reads the hours for all five.
      const r = await diseaseRisk(region.id);
      if (!r.success) { setSick(null); return; }
      setSick(r); setSickAt(new Date());
    } catch { setSick(null); }
  }, [region]);

  // Dew off, the dry days ahead, the next rain — one line. Hidden, not an
  // error, until the tool is priced: a line that cannot be answered is simply
  // not a line on the page.
  const [drying, setDrying] = useState<DryingWindowResult | null>(null);
  const [dryingAt, setDryingAt] = useState<Date | null>(null);
  const runDrying = useCallback(async () => {
    try {
      const r = await dryingWindow(region.id);
      if (!r.success) { setDrying(null); return; }
      setDrying(r); setDryingAt(new Date());
    } catch { setDrying(null); }
  }, [region]);

  // Rain against what the air pulls out, and the model's soil. Hidden, like
  // drying, until the tool is priced and answers.
  const [water, setWater] = useState<WaterBalanceResult | null>(null);
  const [waterAt, setWaterAt] = useState<Date | null>(null);
  const runWater = useCallback(async () => {
    try {
      const r = await waterBalance(region.id);
      if (!r.success) { setWater(null); return; }
      setWater(r); setWaterAt(new Date());
    } catch { setWater(null); }
  }, [region]);

  // Re-read whenever the active region changes — the whole app is scoped by it.
  //
  // The curve first, alone, and the trends after it lands. These five calls
  // used to start together, and between them they ask the weather service for
  // about twenty readings at once — which is slow to finish and is what tipped
  // it into refusing us. Staged, the chart arrives while the trends are still
  // being read, and the chart is what a grower opened this page for.
  useEffect(() => {
    let live = true;
    void (async () => {
      await run();
      if (!live) return;
      await Promise.all([runFrost(), runSoil(), runDisease(), runDrying(), runWater()]);
    })();
    return () => { live = false; };
  }, [run, runFrost, runSoil, runDisease, runDrying, runWater]);

  // Every threshold the grower has entered is a GDD number, and where it meets
  // this curve is a date. The curve is already on the page, so this needs no
  // second call.
  const parts = partsOf(plantingRows.inside, pestRows.inside, wildlifeRows.inside, taskParts);
  const flags: LedgerFlag[] = data
    ? rollUpFlags(region.id, parts, (plot) => {
        const on = <T,>(h: { items: T[]; plotOf: (t: T) => string }) =>
          h.items.filter((i) => h.plotOf(i) === plot);
        return [
          ...buildFlags(data, on(plantingRows), on(pestRows), on(wildlifeRows)),
          ...taskFlags(tasks.filter((k) => (k.region_id ?? region.id) === plot)),
        ];
      })
    : [];

  // What this block grows, as the grower wrote it — the record's side of the
  // join against each model's own "developed for" list.
  const cropNames = plantings.map((p) => p.crop).filter(Boolean);
  // The last wet period and the next one, as washes on the date axis.
  const wetBands = bands(data, sick, cropNames);
  const dryLine = drying ? dryingLine(drying) : null;

  // Find an event by name and centre the chart on it. Every keystroke is a
  // local search over marks already on the page — nothing is fetched.
  /// The five readings as one table, for the share button in the top bar.
  useShare(useMemo(
    () => (data || frost || soil || drying || sick
      ? ledgerSheet({ region, heat: data, frost, soil, drying, disease: sick }, u.unit)
      : null),
    [region, data, frost, soil, drying, sick, u.unit],
  ));

  const [find, setFind] = useState("");
  const [focus, setFocus] = useState<{ flag: LedgerFlag; nonce: number } | null>(null);
  const todayIdx = (data?.curve?.cumulative_mean?.length ?? 1) - 1;
  const onFind = (text: string) => {
    setFind(text);
    const hit = findEvent(flags, text, todayIdx);
    if (!hit) return;
    setShowFlags(true);   // a found mark the reader cannot see is no find
    setFocus({ flag: hit, nonce: Date.now() });
  };
  const findMiss = find.trim().length >= MIN_QUERY && !findEvent(flags, find, todayIdx);

  // One chiclet, one tap per measure, and a tap that clears it. The almanac is
  // asked for on the first tap rather than with the page, and it goes through
  // the same held answer the Almanac page itself reads — so a reader who has
  // been on that page, or who has been on this one long enough for it to be
  // warmed behind them, gets the overlay without a second fare or a wait.
  const cycleWeather = useCallback(async () => {
    const next = (wx + 1) % (WEATHER.length + 1);
    setWx(next);
    if (next === 0 || almanac) return;
    setWxBusy(true);
    try {
      const a = await loadAlmanac(region);
      if (a.success) { setAlmanac(a); setAlmanacAt(new Date()); }
      else setError(a.error || t("views.heatLedger.err.weather"));
    } catch (e) { setError((e as Error).message); }
    finally { setWxBusy(false); }
  }, [wx, almanac, region, t]);

  // Reading a different block means the old block's weather is wrong.
  useEffect(() => { setAlmanac(null); setWx(0); }, [region.id]);

  const overlay = wx > 0 && almanac ? buildOverlay(WEATHER[wx - 1], almanac) : null;

  const g = data?.accumulated_gdd;
  const ahead = data?.normals?.ahead_of_normal_gdd ?? null;
  const storm = drying?.storm ?? null;


  return (
    <>
      {/* The rail already names this view and the region chip already names
          the ground, so neither is repeated here. What is left is the two
          dials a grower actually set, and the way to the sources. */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <h1 className="figure text-[1.375rem] font-bold leading-none">{t("views.heatLedger.title")}</h1>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5" {...tour("ledger.chips")}>
            <Tag>{t("views.heatLedger.tag.base", { base: u.showTemp(data.base_temp_f) })}</Tag>
            <Tag>{t("views.heatLedger.tag.from", { date: fmt(data.season_start) })}</Tag>
            {data.region && (
              <Tag>{t("views.heatLedger.tag.samples", {
                count: data.region.sample_count, m: Math.round(data.region.grid_spacing_m),
              })}</Tag>
            )}
            <button onClick={() => onView?.("references")}
              className="data rounded-full border border-rule px-2.5 py-1 text-[0.625rem] text-ink-soft active:bg-band">
              {t("views.heatLedger.sources")}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[0.8125rem] text-clay">
          {error}
          <button onClick={run} className="ml-3 underline">{t("views.heatLedger.tryAgain")}</button>
        </div>
      )}

      {/* ── Pulse strip ───────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 border-t-2 border-b border-t-ink border-b-rule sm:grid-cols-3 lg:grid-cols-6">
        <PulseTile
          emoji="🌡️" tourId="ledger.heat"
          value={g && data ? `${Math.round(g.mean)}${sub(data.base_temp_f)}` : busy ? "…" : "—"}
          unit={g ? t("views.heatLedger.pulse.gddTotal") : ""}
          label={data ? t("views.heatLedger.pulse.since", { date: fmt(data.season_start) }) : t("views.heatLedger.pulse.thisSeason")}
          gauge={heatGauge(data)}
        />
        <PulseTile
          emoji={<Hillside />} tourId="ledger.spread"
          value={g && data ? `${Math.round(g.spread)}${sub(data.base_temp_f)}` : busy ? "…" : "—"}
          unit={g ? "GDD Δ" : ""}
          muted={!g || g.spread <= 0}
          title={t("views.heatLedger.pulse.spreadTitle")}
          label={
            !g
              ? t("views.heatLedger.pulse.acrossBlock")
              : g.spread <= 0
                ? t("views.heatLedger.pulse.allAlike")
                : daysApart(g, data) != null
                  ? t("views.heatLedger.pulse.daysApart", { count: daysApart(g, data) ?? 0 })
                  : t("views.heatLedger.pulse.acrossBlock")
          }
          gauge={spreadGauge(g)}
        />
        <PulseTile
          emoji={ahead == null ? "📊" : ahead >= 0 ? "📈" : "📉"}
          tourId="ledger.ahead"
          value={ahead == null || !data ? "—" : `${Math.abs(Math.round(ahead))}${sub(data.base_temp_f)}`}
          unit={ahead == null || !data ? "" : ahead >= 0 ? t("views.heatLedger.pulse.gddAhead") : t("views.heatLedger.pulse.gddBehind")}
          tone={ahead == null ? undefined : ahead >= 0 ? "growth" : "frost"}
          gauge={aheadGauge(data)}
          title={data?.normals ? t("views.heatLedger.pulse.against", { n: data.normals.span_years, band: bandScale(data) }) : undefined}
          label={data?.normals ? t("views.heatLedger.pulse.vs", { n: data.normals.span_years }) : t("views.heatLedger.pulse.vsRecent")}
        />
        <PulseTile emoji="❄️" tone="frost" tourId="ledger.frost" value={frostTile.value} label={frostTile.label}
          muted={frostTile.muted} title={frostTile.title} gauge={frostGauge(frost, frostTile.iso)} />
        <PulseTile
          emoji={frost?.worst_night && frost.worst_night.level !== "clear" ? "🥶" : "🌙"} tourId="ledger.cold"
          value={frost?.worst_night ? u.showTemp(frost.worst_night.low_ground_f) : "—"}
          tone="frost"
          muted={!frost?.worst_night}
          gauge={coldGauge(frost, u.showTemp, u.temp)}
          title={frost?.worst_night
            ? t("views.heatLedger.pulse.coldestTitle", {
              date: shortDate(frost.worst_night.date), low: u.showTemp(frost.worst_night.forecast_low_f),
            })
            : undefined}
          label={frost?.worst_night ? t("views.heatLedger.pulse.coldest", { date: shortDate(frost.worst_night.date) }) : t("views.heatLedger.pulse.coldestAhead")}
        />
        {/* The barometer, read on the drying call the Dashboard already makes
            — no second fare. The figure is the reading; the words are the
            storm signal when there is one, else which way it is heading.
            Tapping it opens the Almanac, where the warning is said in full. */}
        <button onClick={() => onView?.("almanac")} {...tour("ledger.storm")}
          className="min-w-0 border-l border-rule text-left active:bg-band">
          <PulseTile
            emoji={storm && storm.level !== "none" ? "🌀" : "🧭"}
            value={storm ? u.showPressure(storm.now_hpa).replace(u.pressureUnit, "") : "—"}
            unit={storm ? u.pressureUnit.trim() : ""}
            tone={storm?.level === "severe" || storm?.level === "storm likely" ? "clay" : undefined}
            muted={!storm}
            title={storm?.reason}
            gauge={storm ? baroGauge(storm.now_hpa) : null}
            label={!storm ? t("views.heatLedger.pulse.barometer")
              : storm.level !== "none" ? `${tendencyArrow(storm)} ${stormWords(storm)}`
              : `${tendencyArrow(storm)} ${direction(t, storm.tendency?.direction)}`}
          />
        </button>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowGround((v) => !v)} {...tour("ledger.ground")}
          title={t("views.heatLedger.groundTitle")}
          className={`min-h-11 rounded-full border px-3.5 text-[0.75rem] font-medium ${
            showGround ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"}`}>
          {t("views.heatLedger.ground")}
        </button>
        {flags.length > 0 && (
          <button onClick={() => setShowFlags((v) => !v)} {...tour("ledger.events")}
            title={t("views.heatLedger.eventsTitle")}
            className={`min-h-11 rounded-full border px-3.5 text-[0.75rem] font-medium ${
              showFlags ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"}`}>
            {t("views.heatLedger.events")}
          </button>
        )}
        <button onClick={cycleWeather} disabled={wxBusy} {...tour("ledger.weather")}
          title={t("views.heatLedger.weatherTitle")}
          className={`min-h-11 rounded-full border px-3.5 text-[0.75rem] font-medium ${
            wx > 0 ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"}`}>
          {wxBusy ? "…" : wx === 0 ? t("views.heatLedger.weather") : `${WEATHER[wx - 1].emoji} ${t(WEATHER[wx - 1].label)}`}
        </button>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3">
          {flags.length > 0 && (
            <label className="flex items-center gap-1.5">
              <input type="search" value={find} onChange={(e) => onFind(e.target.value)}
                placeholder={t("views.heatLedger.findPlaceholder")} aria-label={t("views.heatLedger.findLabel")}
                className={`h-9 w-44 rounded-full border bg-white px-3 text-[0.8125rem] focus:outline-none ${
                  findMiss ? "border-clay" : "border-rule focus:border-honey"}`} />
              {findMiss && <span className="data text-[0.65625rem] text-clay">{t("views.heatLedger.noMatch")}</span>}
            </label>
          )}
          {almanacAt && (
            <Provenance tool="goodearth_almanac" at={almanacAt} onCost={onCost} from={readingTime(almanac)} />
          )}
          <Provenance tool="goodearth_gdd_season_curve" at={ranAt} onCost={onCost} from={readingTime(data)} />
        </span>
      </div>

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller quotes={AGRARIAN_QUOTES} source={AGRARIAN_SOURCE} heading={t("views.heatLedger.reading", { plot: region.name })} intervalMs={6500} classNames={quoteStyles} />
        </div>
      ) : data ? (
        <ChartFrame label={t("views.heatLedger.chartLabel")} tour="ledger.chart">
          <SeasonChart data={data} frostDayIndex={frostIndex(data, frostTile.iso)} frostTitle={frostTile.title}
            flags={showFlags ? flags : []} onFlag={setOpenFlag} showGround={showGround}
            overlay={overlay} bands={wetBands} focus={focus} />
        </ChartFrame>
      ) : null}

      {/* ── Trends: one heading, and every trend named by its own label ──
          It was four cards under one heading with a bare "read 7:05 PM" above
          each and no word saying which was which. The heading used to be
          re-declared inside each block, guarded by which blocks came before
          it; one heading shown when any trend is, is the same thing plainly. */}
      {(frost || soil || dryLine || sick) && (
        <h2 className="figure mt-6 mb-1 text-[1.125rem] font-semibold" {...tour("ledger.trends")}>
          <span className="mr-0.5">🔔</span>{t("views.heatLedger.trends")}
        </h2>
      )}

      {frost && (
        <>
          <TrendLabel emoji="❄️" label={t("views.heatLedger.trend.freezing")}>
            <Provenance tool="goodearth_frost_window" at={frostAt} onCost={onCost} from={readingTime(frost)} />
          </TrendLabel>
          <FrostCard data={frost} />
        </>
      )}

      {soil && (
        <>
          <TrendLabel emoji="🪱" label={t("views.heatLedger.trend.soil")}>
            <Provenance tool="goodearth_soil_temp_projection" at={soilAt} onCost={onCost} from={readingTime(soil)} />
          </TrendLabel>
          <SoilCard data={soil} />
        </>
      )}

      {/* Drying: the line as the caption, the days as a strip of cards. Its
          own panel, never bands on the season chart — wet and dry washes on
          one chart would be two stories at once. */}
      {dryLine && drying && (
        <>
          <TrendLabel emoji="🌾" label={t("views.heatLedger.trend.drying")}>
            <Provenance tool="goodearth_drying_window" at={dryingAt} onCost={onCost} from={readingTime(drying)} />
          </TrendLabel>
          <div className="mb-3 rounded-md border border-rule bg-panel px-3 pt-2.5 pb-3">
            <p className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.78125rem] text-ink-soft">
              <span>{dryLine}</span>
              <Term of="drying" />
            </p>
            <DryingStrip data={drying} />
          </div>
        </>
      )}

      {water && (
        <>
          <TrendLabel emoji="💧" label={t("views.heatLedger.trend.water")}>
            <Provenance tool="goodearth_water_balance" at={waterAt} onCost={onCost} from={readingTime(water)} />
          </TrendLabel>
          <div className="mb-3 rounded-md border border-rule bg-panel px-3 pt-2.5 pb-3">
            <p className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.78125rem] text-ink-soft">
              <span>{waterLine(water, u.unit)}</span>
              <Term of="water" />
            </p>
            <WaterStrip data={water} blockId={region.id} />
          </div>
        </>
      )}

      {sick && (
        <>
          <TrendLabel emoji="🍄" label={t("views.heatLedger.trend.diseases")}>
            <Provenance tool="goodearth_disease_risk" at={sickAt} onCost={onCost} from={readingTime(sick)} />
          </TrendLabel>
          <DiseaseCard data={sick} plantings={cropNames} />
        </>
      )}

      {/* The ledger is the season's spine; these are its ribs. Naming them
          here beats a rail label alone, because the reason to open one is
          usually a question this page just raised. */}
      {openFlag && data && (
        <EventDetail flag={openFlag} curve={data} onClose={() => setOpenFlag(null)} />
      )}

      <h2 className="figure mt-7 mb-2.5 text-[1.125rem] font-semibold" {...tour("ledger.doors")}>🧭 {t("views.heatLedger.moreViews")}</h2>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { to: "almanac" as const, emoji: "🌤️", title: t("views.almanac.title"),
            line: t("views.heatLedger.door.almanac") },
          { to: "crops" as const, emoji: "🌱", title: t("views.heatLedger.door.floraTitle"),
            line: t("views.heatLedger.door.flora") },
          { to: "pests" as const, emoji: "🐛", title: t("views.pests.title"),
            line: t("views.heatLedger.door.pests") },
          { to: "wildlife" as const, emoji: "🦋", title: t("views.wildlife.title"),
            line: t("views.heatLedger.door.fauna") },
          { to: "reports" as const, emoji: "📓", title: t("views.fieldReports.title"),
            line: t("views.heatLedger.door.reports") },
          { to: "plots" as const, emoji: "🗺️", title: t("views.plots.title"),
            line: t("views.heatLedger.door.plots") },
        ].map((c) => (
          <button key={c.to} onClick={() => onView?.(c.to)}
            className="rounded-md border border-rule bg-panel px-3.5 py-3 text-left active:border-ink">
            <div className="figure text-[0.90625rem] font-semibold">
              <span className="mr-1.5">{c.emoji}</span>{c.title}
            </div>
            <p className="mt-0.5 text-[0.78125rem] leading-snug text-ink-soft">{c.line}</p>
          </button>
        ))}
      </div>
    </>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="data rounded-full bg-band px-2.5 py-1 text-[0.625rem] text-ink-soft">{children}</span>
  );
}

/// The name of one trend, with when it was read on the right.
function TrendLabel({ emoji, label, children }: {
  emoji: string; label: string; children?: ReactNode;
}) {
  return (
    <div className="mt-4 mb-1.5 flex items-baseline gap-2.5">
      <h3 className="figure text-[0.9375rem] font-semibold">
        <span className="mr-1" aria-hidden="true">{emoji}</span>{label}
      </h3>
      <span className="ml-auto">{children}</span>
    </div>
  );
}

/// Where the first frost falls along the curve's own day axis, so the
/// chart can draw the line in the same coordinate space as the data. Null when
/// the date sits outside the plotted range — better no line than one clamped
/// to an edge, which would read as a frost date that is not real.
function frostIndex(curve: SeasonCurveResult, median: string | undefined): number | null {
  const dates = curve.curve?.dates;
  if (!median || !dates?.length) return null;
  const start = new Date(dates[0] + "T12:00:00").getTime();
  const idx = Math.round((new Date(median + "T12:00:00").getTime() - start) / 86_400_000);
  const total = dates.length + (curve.forecast?.cumulative.length ?? 0) + (curve.projection?.cumulative.length ?? 0);
  return idx >= 0 && idx < total ? idx : null;
}

const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString(languageLocale(), { month: "short", day: "numeric" });

/// Which way the barometer is heading, in words. The key is the service's own.
function direction(t: Translate, d: string | undefined): string {
  const words: Record<string, string> = {
    rising: t("views.heatLedger.dir.rising"),
    falling: t("views.heatLedger.dir.falling"),
    steady: t("views.heatLedger.dir.steady"),
  };
  return words[d ?? "steady"] ?? d ?? words.steady;
}

/// The grid the normal band was actually read from, as a short suffix.
///
/// The band prefers a 1 km feed and falls back to the 9 km reanalysis when
/// that feed cannot answer, so which one produced this number varies between
/// calls. References describes both; only the response knows which ran, and a
/// comparison against a band is worth little without the grid it was measured
/// on.
function bandScale(data: SeasonCurveResult | null): string {
  const band = data?.sources?.find((s) => s.role.includes("normal band"));
  if (!band) return "";
  const m = band.resolution_m;
  return m >= 1000 ? tr("views.heatLedger.bandKm", { n: Math.round(m / 1000) }) : tr("views.heatLedger.bandM", { n: m });
}

/// Where this season sits inside the ten-season range, as a 0..1 position.
/// The number says how much heat; this says whether that is a lot.
function heatGauge(data: SeasonCurveResult | null): Gauge | null {
  const t = data?.normals?.today;
  const mean = data?.accumulated_gdd?.mean;
  if (!t || mean == null || t.max <= t.min) return null;
  return {
    kind: "range",
    ticks: [{ pos: (t.mean - t.min) / (t.max - t.min), label: tr("views.heatLedger.gauge.normal") }],
    pos: (mean - t.min) / (t.max - t.min),
    lo: <><Wide>{tr("views.heatLedger.gauge.coolest")} </Wide>{Math.round(t.min).toLocaleString(languageLocale())}</>,
    hi: <>{Math.round(t.max).toLocaleString(languageLocale())}<Wide> {tr("views.heatLedger.gauge.warmest")}</Wide></>,
  };
}

/// The block itself, drawn on the strip's own gauge: where the average sits
/// between the coolest hollow and the warmest bench. Null when every sample
/// reads alike — a gauge with both ends at one value would draw a picture of
/// variation that is not there.
function spreadGauge(g?: { min: number; mean: number; max: number; spread: number } | null): Gauge | null {
  if (!g || g.spread <= 0 || g.max <= g.min) return null;
  return {
    kind: "range",
    pos: (g.mean - g.min) / (g.max - g.min),
    lo: `🥶 ${Math.round(g.min).toLocaleString(languageLocale())}`,
    hi: `${Math.round(g.max).toLocaleString(languageLocale())} ☀️`,
  };
}

/// The reading on a barometer's own face: stormy, rain, change, fair, dry,
/// shaded from wet to dry, with the three middle words printed under it.
function baroGauge(hpa: number): Gauge {
  const shade: Record<string, string> = {
    stormy: "bg-clay/35", rain: "bg-frost/30", change: "", fair: "bg-honey/30", dry: "bg-honey/50",
  };
  return {
    kind: "range", pos: onFace(hpa),
    zones: FACE.zones.filter((z) => shade[z.word]).map((z) =>
      ({ from: onFace(z.from), to: onFace(z.to), className: shade[z.word] })),
    ticks: FACE.zones.slice(1).map((z) => ({ pos: onFace(z.from) })),
    labels: FACE.zones.filter((z) => ["rain", "change", "fair"].includes(z.word))
      .map((z) => ({ pos: onFace((z.from + z.to) / 2), text: faceWord(z.word) })),
  };
}

/// A hillside: the block's slope, coolest at its foot and warmest up the
/// bench. A mountain overstated a farm's few metres of relief.
function Hillside() {
  return (
    <svg viewBox="0 0 32 32" className="size-[1.1em]" aria-hidden>
      <path d="M1 25 C 9 23, 15 15, 31 11 L31 29 L1 29 Z" fill="var(--color-growth)" opacity="0.45" />
      <path d="M1 29 L1 22 C 8 22, 14 18, 22 19 C 26 19.5, 29 21, 31 22 L31 29 Z" fill="var(--color-growth)" />
      <circle cx="24" cy="7" r="3" fill="var(--color-honey)" />
    </svg>
  );
}

/// Words a gauge end can lose on a phone, where only its number fits.
function Wide({ children }: { children: ReactNode }) {
  return <span className="hidden sm:inline">{children}</span>;
}

/// Ahead or behind, as a bar out from normal. Full length is the edge of the
/// normal range for today — so a full bar means "as far ahead as any season
/// on record", and the length is not a scale anybody made up.
function aheadGauge(data: SeasonCurveResult | null): Gauge | null {
  const t = data?.normals?.today;
  const ahead = data?.normals?.ahead_of_normal_gdd;
  if (!t || ahead == null) return null;
  const reach = ahead >= 0 ? t.max - t.mean : t.mean - t.min;
  if (reach <= 0) return null;
  return { kind: "diverge", value: ahead / reach, lo: tr("views.heatLedger.gauge.behind"), hi: tr("views.heatLedger.gauge.ahead") };
}

const dayMs = (iso: string) => new Date(iso + "T12:00:00").getTime();

/// The frost date against the record: earliest to latest first frost, a tick
/// at the median, the marker at the date the tile shows.
function frostGauge(frost: FrostWindowResult | null | undefined, iso?: string): Gauge | null {
  const rec = frost?.first_frost;
  if (!rec || !iso) return null;
  const lo = dayMs(rec.earliest), hi = dayMs(rec.latest);
  if (hi <= lo) return null;
  const at = (d: string) => (dayMs(d) - lo) / (hi - lo);
  return {
    kind: "range", pos: at(iso),
    ticks: [{ pos: at(rec.median), label: tr("views.heatLedger.gauge.median", { date: shortDate(rec.median) }) }],
    lo: <><Wide>{tr("views.heatLedger.gauge.earliest")} </Wide>{shortDate(rec.earliest)}</>,
    hi: <>{shortDate(rec.latest)}<Wide> {tr("views.heatLedger.gauge.latest")}</Wide></>,
  };
}

/// The coldest ground's low on a thermometer strip with the frost thresholds
/// marked. The strip runs a little past hard freeze and watch on either side,
/// so a reading at a threshold is not drawn at the very end.
function coldGauge(
  frost: FrostWindowResult | null | undefined, show: (f: number) => string,
  temp: (f: number) => number,
): Gauge | null {
  // The marks are bare degrees ("28°"): three of them share a strip a phone
  // draws 150px wide, and the figure beside the icon already names the scale.
  const deg = (f: number) => `${Math.round(temp(f))}°`;
  const n = frost?.worst_night;
  const th = frost?.thresholds_f;
  if (!n || !th) return null;
  const lo = th.hard_freeze - 6, hi = th.watch + 6;
  const at = (f: number) => (f - lo) / (hi - lo);
  // Shaded deepest where it is coldest: hard freeze, frost, watch, then clear.
  const zone = (from: number, to: number, className: string) =>
    ({ from: at(from), to: at(to), className });
  return {
    kind: "range", pos: at(n.low_ground_f),
    zones: [
      zone(lo, th.hard_freeze, "bg-frost/45"),
      zone(th.hard_freeze, th.frost, "bg-frost/28"),
      zone(th.frost, th.watch, "bg-frost/14"),
    ],
    ticks: [
      { pos: at(th.hard_freeze), label: tr("views.heatLedger.gauge.hardFreeze", { t: show(th.hard_freeze) }), mark: deg(th.hard_freeze) },
      { pos: at(th.frost), label: tr("views.heatLedger.gauge.frost", { t: show(th.frost) }), mark: deg(th.frost) },
      { pos: at(th.watch), label: tr("views.heatLedger.gauge.frostWatch", { t: show(th.watch) }), mark: deg(th.watch) },
    ],
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

/// The cycle. Order runs from what a grower checks most often to least.
/// `label` is a key, read in the language on screen when it is drawn.
const WEATHER: { key: MeasureKey; label: MessageKey; emoji: string; colour: string; bars?: boolean }[] = [
  { key: "precip",    label: "views.heatLedger.wx.rain",     emoji: "🌧️", colour: "var(--color-frost)", bars: true },
  { key: "temp_max",  label: "views.heatLedger.wx.high",     emoji: "🌡️", colour: "var(--color-clay)" },
  { key: "temp_min",  label: "views.heatLedger.wx.low",      emoji: "🌙", colour: "var(--color-frost)" },
  { key: "dew_point", label: "views.heatLedger.wx.dewPoint", emoji: "💧", colour: "var(--color-frost)" },
  { key: "sunshine",  label: "views.heatLedger.wx.sunshine", emoji: "☀️", colour: "var(--color-honey)" },
  { key: "wind_max",  label: "views.heatLedger.wx.wind",     emoji: "🌬️", colour: "var(--color-ink-soft)" },
];

/// Splice the almanac's actual + forecast into one series on the curve's own
/// day axis. The two charts count from the same Jan 1, so the indices line up
/// without any date matching.
function buildOverlay(
  spec: (typeof WEATHER)[number],
  a: AlmanacResult,
): NonNullable<Parameters<typeof SeasonChart>[0]["overlay"]> | null {
  const m = a.measures?.[spec.key];
  if (!m) return null;
  return {
    key: spec.key,
    label: tr(spec.label),
    emoji: spec.emoji,
    unit: m.unit,
    colour: spec.colour,
    asBars: spec.bars,
    values: [...(m.actual ?? []), ...(m.forecast ?? [])],
  };
}

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => String(Math.round(n)).split("").map((c) => SUBS[+c] ?? c).join("");
const fmt = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString(languageLocale(), { month: "short", day: "numeric" });

/// The first-frost tile and the chart's frost line, which mark the same day:
/// the projection, with the record's average beneath it. This season's frost
/// once it has come; else the first frost night in the forecast; else, past
/// the average, the median of the seasons still frost-free this late; else the
/// average itself.
function firstFrost(frost: FrostWindowResult | null | undefined): {
  value: string; label: string; muted?: boolean; iso?: string; title?: string;
} {
  if (frost?.frost_free) return { value: tr("views.heatLedger.frost.none"), label: tr("views.heatLedger.frost.noneOnRecord"), muted: true };
  const rec = frost?.first_frost;
  const now = frost?.this_season;
  const label = rec ? tr("views.heatLedger.frost.ave", { date: shortDate(rec.median) }) : tr("views.heatLedger.frost.first");
  if (now?.first_frost) {
    return { value: shortDate(now.first_frost), iso: now.first_frost, title: tr("views.heatLedger.frost.thisSeason"), label };
  }
  const coming = frost?.nights?.find((n) => n.level === "frost_likely" || n.level === "hard_freeze");
  if (coming) {
    return { value: shortDate(coming.date), iso: coming.date, title: tr("views.heatLedger.frost.inForecast"), label };
  }
  if (!rec) return { value: "—", label, muted: true };
  const later = now?.given_none_yet;
  if (later && (frost?.days_to_median_first_frost ?? 0) < 0) {
    return later.median
      ? { value: shortDate(later.median), iso: later.median, title: tr("views.heatLedger.frost.projected"), label }
      : { value: tr("views.heatLedger.frost.anyNight"), label };
  }
  return { value: shortDate(rec.median), iso: rec.median, title: tr("views.heatLedger.frost.projected"), label };
}
