// Narrowing a table, from a mark beside its search box.
//
// What stood on the Plant ledger was a sentence — "Median first frost Oct 12.
// 2 on this page will not make it." — which is good information on the wrong
// page, and a row of prose above a table nobody came to read prose about. The
// questions behind it are better asked as filters, and once they are asked
// there is nothing left for the sentence to say.
//
// One component, two tables. A grower moving between Plants and Pests should
// not have to learn a second control, so the questions are handed in and the
// mark, the panel, the "what is on" summary and the dismissal are shared.
//
// Dismissal is `RegionPicker`'s, deliberately: same ref, same outside-click,
// same file to look at when it needs changing.

import { useEffect, useRef, useState } from "react";
import { FIELD, Glyph, ICON } from "./ui";

/// One question the panel asks. A toggle, or a number with a unit beside it.
export type Question<F> =
  | { kind: "toggle"; key: keyof F; label: string }
  | { kind: "number"; key: keyof F; label: string; unit: string };

export default function TableFilter<F extends object>({
  value, onChange, questions, empty, summary,
}: {
  value: F;
  onChange: (f: F) => void;
  questions: readonly Question<F>[];
  /// Everything off, for the Clear button.
  empty: F;
  /// What is on, in as few words as fit beside the mark. "" when nothing is.
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const active = summary !== "";
  const set = (key: keyof F, v: unknown) => onChange({ ...value, [key]: v } as F);

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={active ? `Filtered: ${summary}` : "Filter"}
        className={`flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[12px] ${
          active ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"
        }`}
      >
        <Glyph path={ICON.filter} size={16} />
        {/* What is on, when something is — so a short list is never a
            mystery. Nothing at all when nothing is. */}
        {active && <span className="data max-w-[12rem] truncate">{summary}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-rule bg-panel p-2 shadow-lg">
          {questions.map((q) => q.kind === "toggle" ? (
            <label key={String(q.key)} className="flex min-h-11 items-center gap-2 px-2 text-[13px]">
              <input type="checkbox" checked={!!value[q.key]}
                onChange={(e) => set(q.key, e.target.checked)}
                className="h-4 w-4 accent-growth" />
              {q.label}
            </label>
          ) : (
            <div key={String(q.key)} className="flex min-h-11 items-center gap-2 px-2 text-[13px]">
              <label htmlFor={`tf-${String(q.key)}`} className="flex-1">{q.label}</label>
              <input id={`tf-${String(q.key)}`} inputMode="numeric" value={String(value[q.key] ?? "")}
                onChange={(e) => set(q.key, e.target.value)}
                className={`${FIELD} w-20`} />
              <span className="data w-12 text-[11px] text-ink-soft">{q.unit}</span>
            </div>
          ))}
          {active && (
            <button onClick={() => onChange(empty)}
              className="mt-1 min-h-11 w-full rounded px-2 text-left text-[12px] text-ink-soft active:bg-band">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
