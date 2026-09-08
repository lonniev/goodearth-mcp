// What to be looking for, and what to do when you have looked.
//
// The panel this replaces said "American robin — first arrival in about 6
// days" and stopped there. Two things were missing and both are the point of
// keeping a calendar at all.
//
// The window. An interval event is due "about" a date, give or take the ±2%
// the service computes, and a hatch presented to the day gets somebody out to
// the coop at dawn for nothing.
//
// The morning after. A row whose day has passed carries `reached_on` and drops
// out of the projection, so the panel went quiet on exactly the day the grower
// had something to record. "It hatched on the 24th, two days early" is the
// observation that makes next year's count theirs rather than a guess.

import { useState } from "react";
import type { Due } from "../lib/husbandry";
import type { WildlifeRow } from "../lib/mcp";
import { FIELD, Pill, SpeciesMark } from "./ui";

const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/// "in 6 days" / "today" / "2 days ago" — the phrasing a grower would use.
function when(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export default function DueSoon({
  due, photos, today, onObserved, onRepeat, canRepeat, busy,
}: {
  due: Due[];
  photos: Map<string, string>;
  today: string;
  onObserved: (row: WildlifeRow, observedOn: string) => Promise<void>;
  /// Start the cycle again — the composer takes it from here.
  onRepeat: (species: string) => void;
  canRepeat: (species: string) => boolean;
  busy: boolean;
}) {
  /// The row whose "what day was it?" is open, and the day chosen. One at a
  /// time: this is a list of prompts, not a form.
  const [open, setOpen] = useState("");
  const [on, setOn] = useState(today);

  if (!due.length) return null;

  return (
    <div className="mb-5 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
      <span className="eyebrow">Due soon</span>
      <ul className="mt-1.5 space-y-2.5">
        {due.map(({ row, daysAway, settled }) => {
          const id = row.ref ?? `${row.species}·${row.event}`;
          const date = row.projected_date ?? row.reached_on;
          return (
            <li key={id} className="border-b border-rule pb-2.5 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
                <SpeciesMark emoji={row.emoji} photo={photos.get(row.species)} />
                <b>{row.species}</b>
                <span>— {row.event}</span>
                <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  settled ? "bg-growth/12 text-growth"
                    : daysAway < 0 ? "bg-clay/12 text-clay" : "bg-band text-ink-soft"}`}>
                  {settled ? "seen" : when(daysAway)}
                </span>
              </div>

              <p className="data mt-0.5 text-[11px] text-ink-soft">
                {date && day(date)}
                {/* The window, not the day. Gestation and incubation both
                    vary, and this is the service saying by how much. */}
                {row.window && ` · between ${day(row.window.from)} and ${day(row.window.to)}`}
                {row.threshold && ` · ${row.threshold}`}
              </p>

              {open === id ? (
                <div className="mt-1.5 flex flex-wrap items-end gap-2">
                  <label className="block text-[11px] text-ink-soft">
                    What day did you see it?
                    <input type="date" value={on} max={today}
                      onChange={(e) => setOn(e.target.value)} className={FIELD} />
                  </label>
                  <Pill active disabled={busy}
                    onClick={() => {
                      void onObserved(row, on).then(() => setOpen(""));
                    }}>
                    Record it
                  </Pill>
                  <Pill onClick={() => setOpen("")}>not yet</Pill>
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {!settled && (
                    <Pill onClick={() => { setOpen(id); setOn(date && date <= today ? date : today); }}>
                      {/* Defaulted to the day it was DUE when that has passed,
                          because that is the likeliest answer and the grower
                          can still move it. Today, when it has not. */}
                      I saw it
                    </Pill>
                  )}
                  {canRepeat(row.species) && (
                    <Pill onClick={() => onRepeat(row.species)}>
                      Start another
                    </Pill>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
