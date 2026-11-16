// The block in one reading, under the map: how much of it is in full sun this
// month, how that runs through the year, and the best place for panels.

import { MONTHS } from "../lib/companions";
import type { SunlightResult } from "../lib/mcp";
import { CLASS_COLOUR, type SunSummary as Summary } from "../lib/sunGrid";
import { facing } from "./SunPanel";
import { Tx, useLanguageLocale } from "@tollbooth-dpyc/web/react";
import { useT, WORDS } from "../i18n";

/// A month's full name in the reader's language. Mid-month, so no zone moves it.
const fullMonth = (m: number, locale: string) =>
  new Date(2001, m, 15).toLocaleDateString(locale, { month: "long" });

export default function SunSummary({ name, summary, result, month, onMonth, onShowBest }: {
  name: string;
  summary: Summary;
  result: SunlightResult;
  month: number;
  onMonth: (m: number) => void;
  onShowBest: () => void;
}) {
  const t = useT();
  const locale = useLanguageLocale();
  const pc = (v: number) => Math.round(v * 100);
  const s = summary.share;
  const solar = result.solar;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[0.96875rem]">{t("ui.sunSummary.inMonth", { name, month: fullMonth(month, locale) })}</h3>
        <div className="mt-2 flex h-3.5 overflow-hidden rounded-sm" role="img"
          aria-label={t("ui.sunSummary.shares", { sun: pc(s.full_sun), part: pc(s.part_shade), shade: pc(s.full_shade) })}>
          <div style={{ width: `${s.full_sun * 100}%`, background: CLASS_COLOUR.full_sun }} />
          <div style={{ width: `${s.part_shade * 100}%`, background: CLASS_COLOUR.part_shade }} />
          <div style={{ width: `${s.full_shade * 100}%`, background: CLASS_COLOUR.full_shade }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[0.75rem] text-ink-soft">
          <span><Tx ns={WORDS} k="ui.sunSummary.fullSun" vars={{ pc: pc(s.full_sun) }} components={{ b: <b className="text-ink" /> }} /></span>
          <span><Tx ns={WORDS} k="ui.sunSummary.partShade" vars={{ pc: pc(s.part_shade) }} components={{ b: <b className="text-ink" /> }} /></span>
          <span><Tx ns={WORDS} k="ui.sunSummary.fullShade" vars={{ pc: pc(s.full_shade) }} components={{ b: <b className="text-ink" /> }} /></span>
        </div>
      </div>

      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[0.96875rem]">{t("ui.sunSummary.byMonth")}</h3>
        <div className="mt-2 grid h-20 grid-cols-12 items-end gap-1" role="img"
          aria-label={summary.fullSunByMonth.map((v, m) => `${MONTHS[m]} ${pc(v)}%`).join(", ")}>
          {summary.fullSunByMonth.map((v, m) => (
            <button key={m} onClick={() => onMonth(m)} title={`${MONTHS[m]}: ${pc(v)}%`} aria-label={t("ui.sunSummary.monthInSun", { month: MONTHS[m], pc: pc(v) })}
              className={`rounded-sm ${m === month ? "outline outline-2 outline-ink" : ""}`}
              style={{ height: `${Math.max(4, v * 100)}%`, background: CLASS_COLOUR.full_sun }} />
          ))}
        </div>
        <div className="data mt-1 grid grid-cols-12 text-center text-[0.53125rem] text-ink-soft">
          {MONTHS.map((n) => <span key={n}>{n[0]}</span>)}
        </div>
      </div>

      <div className="rounded-md border border-rule bg-panel px-4 py-3.5">
        <h3 className="figure text-[0.96875rem]">{t("ui.sunSummary.best")}</h3>
        {solar && summary.best >= 0 && summary.bestKwh !== null ? (
          <>
            <div className="mt-1"><span className="figure text-[1.625rem] leading-none">{Math.round(summary.bestKwh).toLocaleString(locale)}</span>
              <span className="ml-1 text-[0.75rem] text-ink-soft">{t("ui.sunSummary.kwhPerKw")}</span></div>
            <p className="mt-1 text-[0.75rem] text-ink-soft">
              {summary.bestAccess !== null && t("ui.sunSummary.openSky", { pc: Math.round(summary.bestAccess) })}
              {t("ui.sunSummary.tilted", { tilt: solar.panel.tilt_deg, facing: facing(solar.panel.azimuth_deg) })}
            </p>
            <button onClick={onShowBest}
              className="mt-2 min-h-11 rounded-md border border-ink bg-ink px-4 text-[0.78125rem] font-medium text-paper">
              {t("ui.sunSummary.showIt")}
            </button>
          </>
        ) : (
          <p className="mt-1 text-[0.75rem] text-ink-soft">{t("ui.sunSummary.noSolar")}</p>
        )}
      </div>
    </div>
  );
}
