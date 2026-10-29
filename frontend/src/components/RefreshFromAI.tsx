// 🧠 on a ledger row: the row beside what the reference says, figure by figure.
//
// The button opens a row under the one it sits on. Each figure that differs
// shows the grower's and the reference's, and a tap on either picks it; the
// grower's is picked to begin with. ✓ writes only what was switched.

import { useEffect, useRef, useState } from "react";
import { QuoteScroller } from "@tollbooth-dpyc/web/react";
import type { FieldDiff } from "../lib/refreshRow";
import { NATURALIST_QUOTES, NATURALIST_SOURCE, RESEARCH_WAIT, quoteStyles } from "../lib/quotes";
import Provenance from "./Provenance";
import { RowActions } from "./ui";

/// The 🧠 in a row's actions.
export function RefreshButton({ name, open, onClick }: {
  name: string; open: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      aria-label={`Refresh ${name} from AI`} title="Refresh from AI"
      className={`inline-flex h-11 w-11 items-center justify-center text-[17px] ${
        open ? "" : "opacity-60 grayscale active:opacity-100 active:grayscale-0"}`}>
      🧠</button>
  );
}

export default function RefreshFromAI<T>({ colSpan, tool, ask, onSave, onCancel, onCost, missing }: {
  colSpan: number;
  /// The lookup asked, for its fare.
  tool: string;
  /// The figures that differ; null when the reference has nothing to set
  /// beside this row. Throws with the reason when the lookup fails.
  ask: () => Promise<FieldDiff<T>[] | null>;
  onSave: (taken: FieldDiff<T>[]) => Promise<void>;
  onCancel: () => void;
  onCost?: (sats: number) => void;
  /// Said when `ask` answers null.
  missing: string;
}) {
  const [diffs, setDiffs] = useState<FieldDiff<T>[] | null | undefined>(undefined);
  const [at, setAt] = useState<Date | null>(null);
  const [err, setErr] = useState("");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Asked once, when the row opens: a parent re-rendering hands a new `ask`
  // each time, and each would be a paid lookup.
  const asked = useRef(ask);
  useEffect(() => {
    let live = true;
    asked.current()
      .then((d) => { if (live) { setDiffs(d); setAt(new Date()); } })
      .catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, []);

  function pick(field: string, ai: boolean) {
    const next = new Set(taken);
    if (ai) next.add(field); else next.delete(field);
    setTaken(next);
  }

  async function save() {
    const chosen = (diffs ?? []).filter((d) => taken.has(d.field));
    if (!chosen.length) { onCancel(); return; }
    setSaving(true); setErr("");
    try { await onSave(chosen); } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const cell = (on: boolean) =>
    `min-h-11 rounded-md border px-2.5 text-left text-[12.5px] ${
      on ? "border-growth bg-growth/10 font-semibold text-ink" : "border-rule text-ink-soft active:bg-band"}`;

  return (
    <tr className="border-b border-rule bg-growth/5 last:border-b-0">
      <td colSpan={colSpan} className="px-3 py-2.5">
        <div className="sticky left-3 max-w-[calc(100vw-3.5rem)]">
          {diffs === undefined && !err ? (
            <div className="rounded-md border border-rule bg-band/40">
              <QuoteScroller quotes={NATURALIST_QUOTES} source={NATURALIST_SOURCE}
                heading={RESEARCH_WAIT} intervalMs={6500} classNames={quoteStyles} />
            </div>
          ) : (
            <>
              {err && <p className="mb-1.5 text-[12px] text-clay">{err}</p>}
              {diffs === null && <p className="text-[12.5px] text-ink-soft">{missing}</p>}
              {diffs?.length === 0 && <p className="text-[12.5px] text-growth">✓ Matches the reference.</p>}
              {!!diffs?.length && (
                <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1.5">
                  <span />
                  <span className="data text-[10.5px] text-ink-soft">✍️ Yours</span>
                  <span className="data text-[10.5px] text-ink-soft">🧠 AI</span>
                  {diffs.map((d) => (
                    <div key={d.field} className="contents">
                      <span className="pr-1 text-[12px] font-semibold">{d.label}</span>
                      <button onClick={() => pick(d.field, false)} aria-pressed={!taken.has(d.field)}
                        className={cell(!taken.has(d.field))}>{d.yours}</button>
                      <button onClick={() => pick(d.field, true)} aria-pressed={taken.has(d.field)}
                        className={cell(taken.has(d.field))}>{d.ai}</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-end gap-1">
                {at && <Provenance tool={tool} at={at} onCost={onCost} />}
                {diffs?.length
                  ? <RowActions onCommit={save} onCancel={onCancel} saving={saving} what="the picked figures" />
                  : <button onClick={onCancel} aria-label="Close"
                      className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft">×</button>}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
