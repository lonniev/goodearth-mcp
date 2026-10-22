// The drying days ahead, as a strip of day cards.
//
// The answer always carried ten days of rain, wet hours and drying power, and
// the Dashboard said one sentence about it. This draws the days: a glyph for
// the sky, a bar for how hard the air pulls water out of anything wet (FAO-56
// reference evapotranspiration), the rain when there is any, the dew-off hour
// on the two mornings it is known, 🌀 where a falling barometer crosses, and
// the first unbroken dry run shaded as one stretch with its strongest day
// starred. The sentence stays above it as the caption.
//
// Conditions only, as everywhere on this page: whether a crop is ready to cut
// or hay will cure is the grower's call.

import type { DryDay, DryingWindowResult } from "../lib/mcp";
import { clock } from "../lib/dryingLine";
import { useUnits } from "./Units";

const MM_PER_IN = 25.4;

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/// The sky in one glyph. A dry day the leaves stay wet for half of is not the
/// same day as a dry day with a dry leaf, and the strip says so.
function glyph(d: DryDay): { emoji: string; words: string } {
  if (d.dry == null) return { emoji: "·", words: "no forecast" };
  if (!d.dry) return d.rain_hours >= 6
    ? { emoji: "🌧️", words: `rain for ${d.rain_hours} h` }
    : { emoji: "🌦️", words: `showers, ${d.rain_hours} h` };
  return d.wet_hours >= 8
    ? { emoji: "🌤️", words: `dry, leaves wet ${d.wet_hours} h` }
    : { emoji: "☀️", words: "dry" };
}

export default function DryingStrip({ data }: { data: DryingWindowResult }) {
  const u = useUnits();
  const days = data.days.filter((d) => d.date >= data.today.date).slice(0, 10);
  if (!days.length) return null;
  const peak = Math.max(...days.map((d) => d.et0_mm ?? 0), 0.01);
  const run = data.dry_run;
  const inRun = (d: string) => !!run && d >= run.start && d <= run.end;
  const rain = (mm: number) => u.unit === "F"
    ? `${(mm / MM_PER_IN).toFixed(mm / MM_PER_IN < 0.1 ? 2 : 1)}″`
    : `${mm.toFixed(mm < 10 ? 1 : 0)} mm`;
  const dewOff = (date: string): string | null => {
    const m = date === data.today.date ? data.today.dew_off
      : date === data.tomorrow.date ? data.tomorrow.dew_off : null;
    if (!m) return null;
    if (m.state === "clears" && m.at) return `dry ${clock(m.at)}`;
    if (m.state === "dry") return "dry dawn";
    if (m.state === "wet") return "wet a.m.";
    return null;
  };

  return (
    <>
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
      {days.map((d) => {
        const g = glyph(d);
        const power = (d.et0_mm ?? 0) / peak;
        const best = run?.strongest === d.date;
        const dew = dewOff(d.date);
        return (
          <div key={d.date}
            title={`${weekday(d.date)} ${d.date}: ${g.words}`
              + (d.et0_mm != null ? ` · drying power ${d.et0_mm.toFixed(1)} mm ET₀` : "")
              + (d.vpd_max_kpa != null ? ` · air up to ${d.vpd_max_kpa.toFixed(1)} kPa dry` : "")
              + (d.front_due ? " · a front is due" : "")}
            className={`relative flex flex-col items-center gap-1 rounded-md border px-1 pt-1.5 pb-2 ${
              inRun(d.date) ? "border-growth/40 bg-growth/8" : "border-rule bg-panel"} ${
              d.dry == null ? "opacity-45" : ""}`}>
            {d.front_due && (
              <span className="absolute -top-1.5 -right-1 text-[14px] leading-none" aria-label="front due">🌀</span>
            )}
            <span className="data text-[10px] text-ink-soft">
              {d.date === data.today.date ? "today" : weekday(d.date)}
              {best && <span className="ml-0.5 text-honey" aria-label="strongest drying day">★</span>}
            </span>
            <span className="text-[26px] leading-none" aria-label={g.words}>{g.emoji}</span>

            {/* Drying power: the day's reference evapotranspiration against
                the strongest day in view. Taller dries harder. */}
            <span className="flex h-9 w-3 items-end overflow-hidden rounded-full bg-band" aria-hidden>
              <span className={`w-full rounded-full ${inRun(d.date) ? "bg-growth" : "bg-ink-soft/50"}`}
                style={{ height: `${Math.max(power, d.et0_mm ? 0.06 : 0) * 100}%` }} />
            </span>

            {/* One footer line, always drawn so the row lines up: the rain if
                there is any, otherwise the morning's dew-off where it is known. */}
            <span className={`data h-3 text-[9.5px] leading-3 ${d.rain_mm > 0 ? "text-frost" : "text-ink-soft"}`}>
              {d.rain_mm > 0 ? `💧${rain(d.rain_mm)}` : dew ?? " "}
            </span>
          </div>
        );
      })}
    </div>
    {/* The key, once, in the strip's own glyphs. */}
    <p className="data mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-ink-soft">
      <span><span className="mr-1 inline-block h-2 w-1.5 rounded-full bg-growth align-middle" />drying power (ET₀)</span>
      <span><span className="mr-1 inline-block h-2 w-3 rounded-sm border border-growth/40 bg-growth/8 align-middle" />dry run</span>
      {run?.strongest && <span><span className="text-honey">★</span> strongest drying</span>}
      {days.some((d) => d.front_due) && <span>🌀 front due</span>}
    </p>
    </>
  );
}
