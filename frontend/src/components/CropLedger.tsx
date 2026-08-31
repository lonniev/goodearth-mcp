// The crop ledger — every planting on the block, and whether it finishes.
//
// The bar is heat-to-target, not calendar progress, because that is the clock
// the plant is actually on. A row that will not finish is called out in clay
// rather than left for the reader to compute from two dates.

import type { PlantingStatus } from "../lib/mcp";
import type { Planting } from "../lib/plantings";

const STATUS: Record<string, { label: string; cls: string }> = {
  past_target:     { label: "Past target",  cls: "bg-growth/15 text-growth" },
  on_pace:         { label: "On pace",      cls: "bg-band text-ink-soft" },
  stalled:         { label: "Stalled",      cls: "bg-band text-ink-soft" },
  not_yet_planted: { label: "Not yet out",  cls: "bg-band text-ink-soft" },
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  wont_finish: { label: "Won't finish", cls: "bg-clay/15 text-clay" },
  finishes:    { label: "Finishes",     cls: "bg-growth/10 text-growth" },
  finished:    { label: "Done",         cls: "bg-growth/15 text-growth" },
  unknown:     { label: "Unknown",      cls: "bg-band text-ink-soft" },
};

const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function CropLedger({
  rows, plantings, onDelete,
}: {
  rows: PlantingStatus[];
  plantings: Planting[];
  onDelete: (id: string) => void;
}) {
  const idFor = (crop: string) => plantings.find((p) => p.crop === crop)?.id;

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Crop", "Set out", "Heat to target", "Projected", "Frost", ""].map((h, i) => (
              <th key={h + i}
                className="data border-b-[1.5px] border-ink px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[.1em] text-ink-soft"
                style={i === 2 ? { width: "34%" } : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = STATUS[r.state] ?? STATUS.on_pace;
            const vd = VERDICT[r.finish.verdict] ?? VERDICT.unknown;
            const pct = Math.round((r.progress ?? 0) * 100);
            const over = r.state === "past_target";
            const id = idFor(r.crop);
            return (
              <tr key={r.crop + r.set_out} className="border-b border-rule last:border-b-0">
                <td className="px-3 py-2.5 font-semibold">
                  {r.crop}
                  <small className="block text-[11px] font-normal text-ink-soft">
                    target {r.gdd_target.toLocaleString()} GDD
                    {r.base_temp_f != null && ` · base ${r.base_temp_f}°F`}
                  </small>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{shortDate(r.set_out)}</td>
                <td className="px-3 py-2.5">
                  <div className="relative h-[7px] min-w-[90px] overflow-hidden rounded bg-band">
                    <i className={`absolute inset-y-0 left-0 rounded ${over ? "bg-honey" : "bg-growth"}`}
                       style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="data mt-1 block text-[11px] text-ink-soft">
                    {r.gdd_accumulated != null
                      ? `${Math.round(r.gdd_accumulated).toLocaleString()} / ${r.gdd_target.toLocaleString()}`
                      : r.note}
                    {r.gdd_remaining ? ` · ${Math.round(r.gdd_remaining)} to go` : ""}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {r.projected_date ? shortDate(r.projected_date) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${vd.cls}`}>
                    {vd.label}
                  </span>
                  {/* The verdict's reasoning was tooltip-only. On a tablet
                      that is the same as not shipping it. */}
                  {r.finish.margin_days != null && r.finish.verdict !== "finished" && (
                    <span className="data mt-1 block text-[10px] text-ink-soft">
                      {r.finish.margin_days >= 0
                        ? `${r.finish.margin_days} days of margin`
                        : `${Math.abs(r.finish.margin_days)} days late`}
                    </span>
                  )}
                  {r.finish.at_risk_of_early_frost && r.finish.verdict === "finishes" && (
                    <span className="data mt-1 block text-[10px] text-frost">
                      past the earliest frost on record
                    </span>
                  )}
                  {r.finish.verdict === "wont_finish" && r.finish.gdd_shortfall != null && (
                    <span className="data mt-1 block text-[10px] text-clay">
                      ~{Math.round(r.finish.gdd_shortfall)} GDD short
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className={`mr-2 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold ${st.cls}`}>
                    {st.label}
                  </span>
                  {id && (
                    <button onClick={() => onDelete(id)} aria-label={`Remove ${r.crop}`}
                            className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
