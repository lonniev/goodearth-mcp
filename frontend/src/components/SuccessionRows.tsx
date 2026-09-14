// A crop's succession schedule, under its row in the Sowing table.
//
// Each sowing is its own answer: when it goes out, when it typically finishes
// on this ground, and how many days that leaves before the median frost. The
// late ones — finishing after the earliest frost on record — are the bets,
// and are marked so rather than left for the grower to work out.

import type { SuccessionRow } from "../lib/mcp";
import { Pill } from "./ui";

const short = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function SuccessionRows({ crop, every, rows, onAdd, adding }: {
  crop: string;
  every: number;
  rows: SuccessionRow[];
  onAdd: () => void;
  adding: boolean;
}) {
  if (!rows.length) {
    return (
      <p className="text-[12.5px] text-ink-soft">
        No sowing of {crop} left this season still finishes before the frost.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-[12px] text-ink-soft">
        {crop} every {every} days — {rows.length} sowing{rows.length === 1 ? "" : "s"} still finish here.
      </p>
      <ol className="space-y-1">
        {rows.map((s) => (
          <li key={s.n} className="flex flex-wrap items-baseline gap-x-2.5 text-[12.5px]">
            <span className="data w-7 text-ink-soft">#{s.n}</span>
            <span>out <b>{short(s.out)}</b></span>
            {s.start_seed_indoors && (
              <span className="text-ink-soft">seed indoors {short(s.start_seed_indoors)}</span>
            )}
            <span>finishes <b>{s.finish ? short(s.finish) : "—"}</b></span>
            {s.margin_days != null && (
              <span className="text-ink-soft">{s.margin_days} days before the frost</span>
            )}
            {s.at_risk_of_early_frost && (
              <span className="rounded-full bg-honey/15 px-2 py-0.5 text-[11px] font-semibold text-honey">
                after the earliest frost on record
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-2">
        <Pill onClick={onAdd} disabled={adding} active>
          {adding ? "Adding…" : `＋ Add ${rows.length} to the ledger`}
        </Pill>
      </div>
    </div>
  );
}
