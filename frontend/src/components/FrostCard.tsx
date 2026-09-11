// Frost watch — the card a grower acts on at dusk.
//
// Leads with the coldest ground, not the forecast low, because that is the bed
// that loses the crop. The two numbers are shown together so the difference is
// visible rather than asserted: this is the region abstraction paying off in
// one sentence.

import { useUnits } from "./Units";
import { useState } from "react";
import { isDate } from "../lib/seasonDays";
import type { FrostLevel, FrostNight, FrostWindowResult } from "../lib/mcp";

const TONE: Record<FrostLevel, { border: string; chip: string; word: string }> = {
  hard_freeze: { border: "border-l-clay",  chip: "bg-clay/15 text-clay",   word: "Hard freeze" },
  frost_likely:{ border: "border-l-frost", chip: "bg-frost/15 text-frost", word: "Frost likely" },
  frost_watch: { border: "border-l-frost", chip: "bg-frost/10 text-frost", word: "Frost watch" },
  clear:       { border: "border-l-growth",chip: "bg-growth/10 text-growth", word: "Nothing near freezing" },
};

const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

/// Month and day alone. The weekday is worth saying about a night the grower
/// may be out covering beds; it is noise on a median drawn from eight years.
const shortDay = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function FrostCard({ data }: { data: FrostWindowResult }) {
  const u = useUnits();
  const w = data.worst_night;
  const tone = TONE[w?.level ?? "clear"];
  const offset = data.across_region.coldest_ground_offset_f;

  return (
    <div className={`mb-3 rounded-md border border-rule ${tone.border} border-l-4 bg-panel px-4 py-3.5`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="figure text-[15.5px] font-semibold">
          {w ? `${tone.word} · ${day(w.date)}` : "Frost outlook"}
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
          {data.nights.length}-night outlook
        </span>
      </div>

      {w && w.level !== "clear" ? (
        <p className="mt-1.5 text-[13px] leading-relaxed">
          Forecast low <b>{u.showTemp(w.forecast_low_f)}</b>, but the coldest ground on your
          land sits near <b>{u.showTemp(w.low_ground_f)}</b> — {w.reason}.
          {/* An offset is a DIFFERENCE between two temperatures, so it converts
              without the 32-degree shift — the same arithmetic a degree-day
              gets, which is why it borrows that helper. */}
          {offset > 0 && (
            <> Low ground runs about {u.degreeDays(offset).toFixed(1)}{u.tempUnit} under the forecast on a night like this.</>
          )}
        </p>
      ) : (
        <p className="mt-1.5 text-[13px] leading-relaxed">
          Nothing within reach of freezing in the next {data.nights.length} nights.
          {w && <> The coldest is {u.showTemp(w.low_ground_f)} on low ground, {day(w.date)}.</>}
        </p>
      )}

      {data.first_frost && (
        <FirstFrostDates first={data.first_frost} daysOut={data.days_to_median_first_frost} />
      )}

      {data.nights.length > 0 && <NightStrip nights={data.nights} />}

      {data.across_region.terrain_correction === "unavailable" && (
        <p className="data mt-2 text-[10px] text-clay">
          Terrain unavailable — this is the forecast low with no drainage applied.
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
  const cells = [
    { k: "earliest", label: "earliest", date: first.earliest },
    { k: "median", label: "usually", date: first.median, lead: true },
    { k: "latest", label: "latest", date: first.latest },
  ].filter((c) => isDate(c.date));
  if (!cells.length) return null;
  return (
    <div className="mt-2.5">
      <div className="eyebrow mb-1 text-ink-soft">First frost</div>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-0">
        {cells.map((c) => (
          <div key={c.k}
            className={`flex items-baseline gap-2 sm:flex-1 sm:flex-col sm:items-center sm:gap-0.5 sm:border-l sm:border-rule sm:px-2 sm:first:border-l-0 ${
              c.lead ? "" : "opacity-70"
            }`}>
            <span className="eyebrow text-ink-soft">{c.label}</span>
            <span className={`figure ${c.lead ? "text-[17px] font-semibold" : "text-[13.5px]"}`}>
              {shortDay(c.date)}
            </span>
          </div>
        ))}
      </div>
      <p className="data mt-1.5 text-[10.5px] text-ink-soft">
        {first.years_on_record} seasons on record
        {daysOut != null && daysOut > 0 && ` · ${daysOut} days out`}
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
              aria-label={`${day(n.date)}, coldest ground ${Math.round(n.low_ground_f)} degrees`}
              className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-end gap-1 rounded pb-1 ${
                isOpen ? "bg-band" : "active:bg-band"
              }`}
            >
              <span className="data text-[10px] text-ink-soft">{Math.round(n.low_ground_f)}</span>
              <div className={`w-full max-w-14 rounded-sm ${color}`} style={{ height: h(n.low_ground_f) }} />
              <span className="data text-[10px] text-ink-soft">
                {new Date(n.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
              </span>
            </button>
          );
        })}
      </div>

      {shown && (
        <p className="mt-1.5 rounded bg-band/60 px-3 py-2 text-[12.5px] leading-relaxed">
          <b>{day(shown.date)}</b> — coldest ground {u.showTemp(shown.low_ground_f)},
          forecast {u.showTemp(shown.forecast_low_f)}. {shown.reason}.
          {shown.wind_mph != null && ` Wind ${Math.round(shown.wind_mph)} mph`}
          {shown.cloud_pct != null && `, ${Math.round(shown.cloud_pct)}% cloud`}
          {shown.dew_point_f != null && `, dew point ${u.showTemp(shown.dew_point_f)}`}.
        </p>
      )}
    </>
  );
}
