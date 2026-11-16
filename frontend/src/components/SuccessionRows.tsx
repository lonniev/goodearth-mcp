// A crop's succession schedule, under its row in the Sowing table.
//
// Each sowing is its own answer: when it goes out, when it typically finishes
// on this ground, and how many days that leaves before the median frost. The
// late ones — finishing after the earliest frost on record — are the bets,
// and are marked so rather than left for the grower to work out.

import type { SuccessionRow } from "../lib/mcp";
import { Tx, useLanguageLocale } from "@tollbooth-dpyc/web/react";
import { Pill } from "./ui";
import { useT, WORDS } from "../i18n";

const shortDate = (iso: string, locale: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" });

export default function SuccessionRows({ crop, every, rows, onAdd, adding }: {
  crop: string;
  every: number;
  rows: SuccessionRow[];
  onAdd: () => void;
  adding: boolean;
}) {
  const t = useT();
  const locale = useLanguageLocale();
  const short = (iso: string) => shortDate(iso, locale);
  if (!rows.length) {
    return (
      <p className="text-[0.78125rem] text-ink-soft">
        {t("ui.successionRows.none", { crop })}
      </p>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-[0.75rem] text-ink-soft">
        {t("ui.successionRows.summary", { crop, every, count: rows.length })}
      </p>
      <ol className="space-y-1">
        {rows.map((s) => (
          <li key={s.n} className="flex flex-wrap items-baseline gap-x-2.5 text-[0.78125rem]">
            <span className="data w-7 text-ink-soft">#{s.n}</span>
            <span><Tx ns={WORDS} k="ui.successionRows.out" vars={{ date: short(s.out) }} components={{ b: <b /> }} /></span>
            {s.start_seed_indoors && (
              <span className="text-ink-soft">{t("ui.successionRows.seedIndoors", { date: short(s.start_seed_indoors) })}</span>
            )}
            <span><Tx ns={WORDS} k="ui.successionRows.finishes" vars={{ date: s.finish ? short(s.finish) : "—" }} components={{ b: <b /> }} /></span>
            {s.margin_days != null && (
              <span className="text-ink-soft">{t("ui.successionRows.margin", { n: s.margin_days })}</span>
            )}
            {s.at_risk_of_early_frost && (
              <span className="rounded-full bg-honey/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-honey">
                {t("ui.successionRows.atRisk")}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-2">
        <Pill onClick={onAdd} disabled={adding} active>
          {adding ? t("ui.successionRows.adding") : t("ui.successionRows.add", { n: rows.length })}
        </Pill>
      </div>
    </div>
  );
}
