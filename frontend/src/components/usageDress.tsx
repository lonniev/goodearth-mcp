// The "Last 30 days" card in Good Earth's dress — the same ruled panel, eyebrow
// and figure face as the balance card above it, so the season palette carries
// through. The package does the statement and the arithmetic; this is the look.

import type { ToolSpend } from "@tollbooth-dpyc/web";
import type { UsageFigure, UsageSummaryClassNames } from "@tollbooth-dpyc/web/react";

/// The period's own figures only. The balance sits in the card above, and the
/// lifetime deposited/consumed totals would read as this month's under a
/// "Last 30 days" heading.
export const USAGE_FIGURES: readonly UsageFigure[] = ["spent", "calls", "credited"];

export const USAGE: UsageSummaryClassNames = {
  root: "rounded-xl border border-rule bg-panel px-4 py-3",
  header: "mb-2 flex items-center justify-between gap-3",
  heading: "eyebrow",
  chip: "min-h-11 rounded-full border border-rule px-3.5 text-[12px] text-ink-soft active:bg-band disabled:opacity-60",
  figures: "grid grid-cols-3 gap-x-3 gap-y-2.5",
  figure: "min-w-0",
  value: "figure text-[19px] font-bold leading-none",
  label: "mt-1 text-[11px] text-ink-soft",
  subheading: "eyebrow mt-3.5 mb-1",
  list: "divide-y divide-rule",
  row: "flex items-baseline gap-2 py-1.5 text-[12.5px]",
  tool: "data min-w-0 flex-1 truncate",
  calls: "text-[11.5px] text-ink-soft",
  sats: "data w-20 shrink-0 text-right",
  loading: "text-[12.5px] text-ink-soft",
  error: "text-[12.5px] text-clay",
  empty: "text-[12.5px] text-ink-soft",
};

/// A tool as a grower reads it: "crop gdd status", not "goodearth_crop_gdd_status".
export function UsageRow({ tool }: { tool: ToolSpend }) {
  return (
    <>
      <span className={USAGE.tool}>{tool.tool.replace(/^goodearth_/, "").replace(/_/g, " ")}</span>
      <span className={USAGE.calls}>
        {tool.calls.toLocaleString()} call{tool.calls === 1 ? "" : "s"}
      </span>
      <span className={USAGE.sats}>{tool.sats.toLocaleString()} sats</span>
    </>
  );
}
