// Frost watch — the card a grower acts on at dusk.
//
// Leads with the coldest ground, not the forecast low, because that is the bed
// that loses the crop. The two numbers are shown together so the difference is
// visible rather than asserted: this is the region abstraction paying off in
// one sentence.

import type { FrostLevel, FrostNight, FrostWindowResult } from "../lib/mcp";

const TONE: Record<FrostLevel, { border: string; chip: string; word: string }> = {
  hard_freeze: { border: "border-l-clay",  chip: "bg-clay/15 text-clay",   word: "Hard freeze" },
  frost_likely:{ border: "border-l-frost", chip: "bg-frost/15 text-frost", word: "Frost likely" },
  frost_watch: { border: "border-l-frost", chip: "bg-frost/10 text-frost", word: "Frost watch" },
  clear:       { border: "border-l-growth",chip: "bg-growth/10 text-growth", word: "Nothing near freezing" },
};

const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

export default function FrostCard({ data }: { data: FrostWindowResult }) {
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
          Forecast low <b>{Math.round(w.forecast_low_f)}°F</b>, but the coldest ground on this
          block sits near <b>{Math.round(w.low_ground_f)}°F</b> — {w.reason}.
          {offset > 0 && (
            <> Low ground runs about {offset.toFixed(1)}°F under the forecast on a night like this.</>
          )}
        </p>
      ) : (
        <p className="mt-1.5 text-[13px] leading-relaxed">
          Nothing within reach of freezing in the next {data.nights.length} nights.
          {w && <> The coldest is {Math.round(w.low_ground_f)}°F on low ground, {day(w.date)}.</>}
        </p>
      )}

      {data.first_frost && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Frost normally arrives around <b className="text-ink">{day(data.first_frost.median)}</b> here,
          earliest on record {day(data.first_frost.earliest)} —{" "}
          {data.first_frost.years_on_record} seasons.
          {data.days_to_median_first_frost != null && data.days_to_median_first_frost > 0 && (
            <> That is {data.days_to_median_first_frost} days out.</>
          )}
        </p>
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

/// Ten nights at a glance. The bar is the coldest ground, not the average, so
/// the reader's eye lands on the bed that is actually at risk.
function NightStrip({ nights }: { nights: FrostNight[] }) {
  const lows = nights.map((n) => n.low_ground_f);
  const min = Math.min(...lows, 28), max = Math.max(...lows, 60);
  const h = (v: number) => Math.max(6, Math.round(((v - min) / Math.max(max - min, 1)) * 34) + 6);

  return (
    <div className="mt-3 flex items-end gap-1.5 overflow-x-auto pb-1">
      {nights.map((n) => {
        const color =
          n.level === "hard_freeze" ? "bg-clay"
          : n.level === "frost_likely" ? "bg-frost"
          : n.level === "frost_watch" ? "bg-frost/50"
          : "bg-growth/40";
        return (
          <div key={n.date} className="flex w-8 shrink-0 flex-col items-center gap-1">
            <span className="data text-[9px] text-ink-soft">{Math.round(n.low_ground_f)}</span>
            <div
              className={`w-4 rounded-sm ${color}`}
              style={{ height: h(n.low_ground_f) }}
              title={`${day(n.date)} — coldest ground ${Math.round(n.low_ground_f)}°F (forecast ${Math.round(n.forecast_low_f)}°F). ${n.reason}.`}
            />
            <span className="data text-[9px] text-ink-soft">
              {new Date(n.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
