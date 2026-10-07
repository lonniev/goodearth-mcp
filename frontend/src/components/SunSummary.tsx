// The block in one reading, under the map: how much of it is in full sun this
// month, how that runs through the year, and the best place for panels.

import { MONTHS } from "../lib/companions";
import type { SunlightResult } from "../lib/mcp";
import { CLASS_COLOUR, type SunSummary as Summary } from "../lib/sunGrid";
import { facing } from "./SunPanel";

const FULL_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function SunSummary({ name, summary, result, month, onMonth, onShowBest }: {
  name: string;
  summary: Summary;
  result: SunlightResult;
  month: number;
  onMonth: (m: number) => void;
  onShowBest: () => void;
}) {
  const pc = (v: number) => Math.round(v * 100);
  const s = summary.share;
  const solar = result.solar;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[15.5px]">{name} in {FULL_MONTH[month]}</h3>
        <div className="mt-2 flex h-3.5 overflow-hidden rounded-sm" role="img"
          aria-label={`${pc(s.full_sun)}% full sun, ${pc(s.part_shade)}% part shade, ${pc(s.full_shade)}% full shade`}>
          <div style={{ width: `${s.full_sun * 100}%`, background: CLASS_COLOUR.full_sun }} />
          <div style={{ width: `${s.part_shade * 100}%`, background: CLASS_COLOUR.part_shade }} />
          <div style={{ width: `${s.full_shade * 100}%`, background: CLASS_COLOUR.full_shade }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-ink-soft">
          <span><b className="text-ink">{pc(s.full_sun)}%</b> full sun</span>
          <span><b className="text-ink">{pc(s.part_shade)}%</b> part shade</span>
          <span><b className="text-ink">{pc(s.full_shade)}%</b> full shade</span>
        </div>
      </div>

      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[15.5px]">Share in full sun, by month</h3>
        <div className="mt-2 grid h-20 grid-cols-12 items-end gap-1" role="img"
          aria-label={summary.fullSunByMonth.map((v, m) => `${MONTHS[m]} ${pc(v)}%`).join(", ")}>
          {summary.fullSunByMonth.map((v, m) => (
            <button key={m} onClick={() => onMonth(m)} title={`${MONTHS[m]}: ${pc(v)}%`} aria-label={`${MONTHS[m]}, ${pc(v)}% in full sun`}
              className={`rounded-sm ${m === month ? "outline outline-2 outline-ink" : ""}`}
              style={{ height: `${Math.max(4, v * 100)}%`, background: CLASS_COLOUR.full_sun }} />
          ))}
        </div>
        <div className="data mt-1 grid grid-cols-12 text-center text-[8.5px] text-ink-soft">
          {MONTHS.map((n) => <span key={n}>{n[0]}</span>)}
        </div>
      </div>

      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[15.5px]">Best place for panels</h3>
        {solar && summary.best >= 0 && summary.bestKwh !== null ? (
          <>
            <div className="mt-1"><span className="figure text-[26px] leading-none">{Math.round(summary.bestKwh).toLocaleString()}</span>
              <span className="ml-1 text-[12px] text-ink-soft">kWh per kW a year</span></div>
            <p className="mt-1 text-[12px] text-ink-soft">
              {summary.bestAccess !== null && `${Math.round(summary.bestAccess)}% of open-sky yield · `}
              tilted {solar.panel.tilt_deg}° facing {facing(solar.panel.azimuth_deg)}
            </p>
            <button onClick={onShowBest}
              className="mt-2 min-h-11 rounded-md border border-ink bg-ink px-4 text-[12.5px] font-medium text-paper">
              Show it
            </button>
          </>
        ) : (
          <p className="mt-1 text-[12px] text-ink-soft">No solar figure this time — the radiation archive did not answer.</p>
        )}
      </div>
    </div>
  );
}
