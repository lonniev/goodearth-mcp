// Frost watch — the card a grower acts on at dusk.
//
// Leads with the coldest ground, not the forecast low, because that is the bed
// that loses the crop. The two numbers are shown together so the difference is
// visible rather than asserted: this is the region abstraction paying off in
// one sentence.

import { useUnits } from "./Units";
import { languageLocale } from "@tollbooth-dpyc/web";
import { Tx } from "@tollbooth-dpyc/web/react";
import { useT, WORDS } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { useState } from "react";
import { isDate } from "../lib/seasonDays";
import type { FrostLevel, FrostNight, FrostWindowResult } from "../lib/mcp";

const TONE: Record<FrostLevel, { border: string; chip: string; word: MessageKey }> = {
  hard_freeze: { border: "border-l-clay",  chip: "bg-clay/15 text-clay",   word: "ui.frostCard.hardFreeze" },
  frost_likely:{ border: "border-l-frost", chip: "bg-frost/15 text-frost", word: "ui.frostCard.frostLikely" },
  frost_watch: { border: "border-l-frost", chip: "bg-frost/10 text-frost", word: "ui.frostCard.frostWatch" },
  clear:       { border: "border-l-growth",chip: "bg-growth/10 text-growth", word: "ui.frostCard.nothingNear" },
};

const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString(languageLocale(), { weekday: "long", month: "short", day: "numeric" });

/// Month and day alone. The weekday is worth saying about a night the grower
/// may be out covering beds; it is noise on a median drawn from eight years.
const shortDay = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString(languageLocale(), { month: "short", day: "numeric" });

export default function FrostCard({ data }: { data: FrostWindowResult }) {
  const u = useUnits();
  const t = useT();
  const w = data.worst_night;
  const tone = TONE[w?.level ?? "clear"];
  const offset = data.across_region.coldest_ground_offset_f;

  return (
    <div className={`mb-3 rounded-md border border-rule ${tone.border} border-l-4 bg-panel px-4 py-3.5`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="figure text-[0.96875rem] font-semibold">
          {w ? `${t(tone.word)} · ${day(w.date)}` : t("ui.frostCard.outlook")}
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${tone.chip}`}>
          {t("ui.frostCard.nightOutlook", { n: data.nights.length })}
        </span>
      </div>

      {w && w.level !== "clear" ? (
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed">
          <Tx ns={WORDS} k="ui.frostCard.lowVsGround"
            vars={{ low: u.showTemp(w.forecast_low_f), ground: u.showTemp(w.low_ground_f), reason: w.reason }}
            components={{ b: <b /> }} />
          {/* An offset is a DIFFERENCE between two temperatures, so it converts
              without the 32-degree shift — the same arithmetic a degree-day
              gets, which is why it borrows that helper. */}
          {offset > 0 && (
            <>{" "}{t("ui.frostCard.lowGroundRuns", { n: u.degreeDays(offset).toFixed(1), unit: u.tempUnit })}</>
          )}
        </p>
      ) : (
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed">
          {t("ui.frostCard.nothingInReach", { n: data.nights.length })}
          {w && <>{" "}{t("ui.frostCard.coldestIs", { temp: u.showTemp(w.low_ground_f), day: day(w.date) })}</>}
        </p>
      )}

      {data.first_frost && (
        <FirstFrostDates first={data.first_frost} daysOut={data.days_to_median_first_frost} />
      )}

      {data.nights.length > 0 && <NightStrip nights={data.nights} />}

      {data.across_region.terrain_correction === "unavailable" && (
        <p className="data mt-2 text-[0.625rem] text-clay">
          {t("ui.frostCard.terrainUnavailable")}
        </p>
      )}
    </div>
  );
}

/// When frost first arrives here — earliest, usual, latest.
///
/// The prose said two of these three and made the reader hold them: "normally
/// around Tuesday, Oct 13 here, earliest on record Saturday, Sep 19". `latest`
/// was in the answer all along and never shown, which is the half of the
/// spread that says how much rope a late crop has.
///
/// Three dates on one line with the usual one weighted, so the eye reads the
/// span before it reads any single date. Below `sm` they stack, because three
/// dates squeezed across a phone is three dates nobody can read.
function FirstFrostDates({ first, daysOut }: {
  first: NonNullable<FrostWindowResult["first_frost"]>;
  daysOut: number | null;
}) {
  const t = useT();
  const cells = [
    { k: "earliest", label: t("ui.frostCard.earliest"), date: first.earliest },
    { k: "median", label: t("ui.frostCard.usually"), date: first.median, lead: true },
    { k: "latest", label: t("ui.frostCard.latest"), date: first.latest },
  ].filter((c) => isDate(c.date));
  if (!cells.length) return null;
  return (
    <div className="mt-2.5">
      <div className="eyebrow mb-1 text-ink-soft">{t("ui.frostCard.firstFrost")}</div>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-0">
        {cells.map((c) => (
          <div key={c.k}
            className={`flex items-baseline gap-2 sm:flex-1 sm:flex-col sm:items-center sm:gap-0.5 sm:border-l sm:border-rule sm:px-2 sm:first:border-l-0 ${
              c.lead ? "" : "opacity-70"
            }`}>
            <span className="eyebrow text-ink-soft">{c.label}</span>
            <span className={`figure ${c.lead ? "text-[1.0625rem] font-semibold" : "text-[0.84375rem]"}`}>
              {shortDay(c.date)}
            </span>
          </div>
        ))}
      </div>
      <p className="data mt-1.5 text-[0.65625rem] text-ink-soft">
        {t("ui.frostCard.seasonsOnRecord", { n: first.years_on_record })}
        {daysOut != null && daysOut > 0 && ` · ${t("ui.frostCard.daysOut", { n: daysOut })}`}
      </p>
    </div>
  );
}

/// Ten nights at a glance. The bar is the coldest ground, not the average, so
/// the reader's eye lands on the bed that is actually at risk.
///
/// Tap a night for its detail. A `title` tooltip would have put the reason —
/// the wind and sky that decide whether frost actually forms — somewhere a
/// finger can never reach, which on a tablet means nowhere at all.
function NightStrip({ nights }: { nights: FrostNight[] }) {
  const u = useUnits();
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const lows = nights.map((n) => n.low_ground_f);
  const min = Math.min(...lows, 28), max = Math.max(...lows, 60);
  const h = (v: number) => Math.max(12, Math.round(((v - min) / Math.max(max - min, 1)) * 64) + 12);
  const shown = nights.find((n) => n.date === open);

  return (
    <>
      <div className="mt-3 flex items-end gap-1 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
        {nights.map((n) => {
          const color =
            n.level === "hard_freeze" ? "bg-clay"
            : n.level === "frost_likely" ? "bg-frost"
            : n.level === "frost_watch" ? "bg-frost/50"
            : "bg-growth/40";
          const isOpen = open === n.date;
          return (
            <button
              key={n.date}
              onClick={() => setOpen(isOpen ? null : n.date)}
              aria-pressed={isOpen}
              aria-label={t("ui.frostCard.nightAria", { day: day(n.date), n: Math.round(n.low_ground_f) })}
              className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-end gap-1 rounded pb-1 ${
                isOpen ? "bg-band" : "active:bg-band"
              }`}
            >
              <span className="data text-[0.625rem] text-ink-soft">{Math.round(n.low_ground_f)}</span>
              <div className={`w-full max-w-14 rounded-sm ${color}`} style={{ height: h(n.low_ground_f) }} />
              <span className="data text-[0.625rem] text-ink-soft">
                {new Date(n.date + "T12:00:00").toLocaleDateString(languageLocale(), { weekday: "narrow" })}
              </span>
            </button>
          );
        })}
      </div>

      {shown && (
        <p className="mt-1.5 rounded bg-band/60 px-3 py-2 text-[0.78125rem] leading-relaxed">
          <Tx ns={WORDS} k="ui.frostCard.nightDetail"
            vars={{ day: day(shown.date), ground: u.showTemp(shown.low_ground_f), low: u.showTemp(shown.forecast_low_f), reason: shown.reason }}
            components={{ b: <b /> }} />
          {shown.wind_mph != null && ` ${t("ui.frostCard.wind", { n: Math.round(shown.wind_mph) })}`}
          {shown.cloud_pct != null && `, ${t("ui.frostCard.cloud", { n: Math.round(shown.cloud_pct) })}`}
          {shown.dew_point_f != null && `, ${t("ui.frostCard.dewPoint", { temp: u.showTemp(shown.dew_point_f) })}`}.
        </p>
      )}
    </>
  );
}
