// The Sun layer's controls: what to show, which month, whether the trees are
// in leaf, and what the colours mean. One strip under the map, spread
// across its width — over the map it hid a third of the ground it coloured.

import { QuoteScroller } from "@tollbooth-dpyc/web/react";
import { AGRARIAN_QUOTES, AGRARIAN_SOURCE, quoteStyles } from "../lib/quotes";
import { MONTHS } from "../lib/companions";
import { bareSpan, css, KWH_RAMP, SUN_STOPS, type SunView } from "../lib/sunGrid";

const RAMP = `linear-gradient(90deg, ${SUN_STOPS.map(([h, c]) => `${css(c)} ${(h / 12) * 100}%`).join(", ")})`;

export default function SunPanel({
  view, month, fullLeaf, leafOff, tilt, azimuth, loading, error,
  onView, onMonth, onLeaf,
}: {
  view: SunView;
  month: number;
  fullLeaf: boolean;
  /// The service's leaf-off months, 1-based; empty when the trees never go bare.
  leafOff: number[];
  tilt: number | null;
  azimuth: number | null;
  loading: boolean;
  error: string;
  onView: (v: SunView) => void;
  onMonth: (m: number) => void;
  onLeaf: (full: boolean) => void;
}) {
  const bare = bareSpan(leafOff, MONTHS);
  return (
    <div className="mt-2 rounded-md border border-rule bg-panel px-3 py-2">
      {error ? (
        <p className="text-[12px] text-clay">{error}</p>
      ) : loading ? (
        <QuoteScroller quotes={AGRARIAN_QUOTES} source={AGRARIAN_SOURCE} heading="Casting the sky over this plot" intervalMs={6500} classNames={quoteStyles} />
      ) : (
        // One row on a tablet, wrapping to two or three on a phone: the
        // view, then the month (or the panel), the leaf, and the key last.
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex shrink-0 overflow-hidden rounded-md border border-ink/30 text-[12px]" role="group" aria-label="What to show">
            {(["garden", "solar"] as SunView[]).map((v) => (
              <button key={v} onClick={() => onView(v)} aria-pressed={view === v}
                className={`min-h-10 px-3 font-medium ${view === v ? "bg-ink text-paper" : "text-ink active:bg-band"}`}>
                {v === "garden" ? "Garden light" : "Solar panels"}
              </button>
            ))}
          </div>

          {view === "garden" ? (
            <div className="flex min-w-[14rem] flex-1 items-center gap-2">
              <label htmlFor="sun-month" className="text-[11px] text-ink-soft">Month</label>
              <input id="sun-month" type="range" min={0} max={11} step={1} value={month}
                onChange={(e) => onMonth(Number(e.target.value))}
                aria-label="Month"
                className="h-11 flex-1 accent-[color:var(--color-honey)]" />
              <span className="data w-[2.5rem] shrink-0 text-[12px]">{MONTHS[month]}</span>
            </div>
          ) : (
            <p className="min-w-[14rem] flex-1 text-[12px] text-ink-soft">
              Fixed panels{tilt !== null && <>, tilted <b className="data text-ink">{tilt}°</b></>}
              {azimuth !== null && <>, facing <b className="text-ink">{facing(azimuth)}</b></>} · whole year
            </p>
          )}

          {bare && (
            <button onClick={() => onLeaf(!fullLeaf)} aria-pressed={!fullLeaf}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-[12px] font-medium ${
                fullLeaf ? "border-rule text-ink-soft" : "border-growth bg-growth/10 text-growth"
              }`}>
              {fullLeaf ? "🌳 Full leaf all year" : `🍂 ${bare}`}
            </button>
          )}

          <div className="min-w-[16rem] flex-1">
            {view === "garden" ? (
              <>
                <p className="text-[10.5px] text-ink-soft">Hours of direct sun a day in {MONTHS[month]}</p>
                <div className="mt-0.5 h-2.5 rounded-sm" style={{ background: RAMP }} />
                <div className="mt-0.5 flex justify-between text-[10.5px] text-ink-soft">
                  <span>Full shade · under 3 h</span><span>Part shade · 3–6 h</span><span>Full sun · 6 h+</span>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10.5px] text-ink-soft">kWh a year for each kW of panels installed here · ◆ marks the best spot</p>
                <div className="mt-0.5 h-2.5 rounded-sm" style={{ background: RAMP }} />
                <div className="data relative mt-0.5 h-3.5 text-[10px] text-ink-soft">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={`absolute ${i === 0 ? "" : i === 4 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${i * 25}%` }}>
                      {(KWH_RAMP.lo + ((KWH_RAMP.hi - KWH_RAMP.lo) * i) / 4).toLocaleString()}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/// A compass word for a panel's facing, so the panel reads "facing south" not "180°".
export function facing(azimuth: number): string {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round(((azimuth % 360) + 360) % 360 / 45) % 8];
}
