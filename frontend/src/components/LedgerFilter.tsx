// Narrowing the ledger, from a mark beside the search box.
//
// What stood here was a sentence — "Median first frost Oct 12. 2 on this page
// will not make it." — which is good information on the wrong page: the
// Dashboard carries frost, and this is a row of prose above a table nobody
// came to read prose about. The questions behind it are better asked as
// filters, and once they are asked there is nothing left for the sentence to
// say.
//
// Dismissal is `RegionPicker`'s, deliberately: same ref, same outside-click,
// same file to look at when it needs changing.

import { useEffect, useRef, useState } from "react";
import { isOn, summarise, type LedgerFilter as Filter } from "../lib/ledgerFilter";
import { FIELD, Glyph, ICON } from "./ui";

export default function LedgerFilter({ value, onChange }: {
  value: Filter;
  onChange: (f: Filter) => void;
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

  const active = isOn(value);
  const set = (over: Partial<Filter>) => onChange({ ...value, ...over });

  const check = (key: "readyBeforeFrost" | "hasSeed", label: string) => (
    <label className="flex min-h-11 items-center gap-2 px-2 text-[13px]">
      <input type="checkbox" checked={value[key]}
        onChange={(e) => set({ [key]: e.target.checked } as Partial<Filter>)}
        className="h-4 w-4 accent-growth" />
      {label}
    </label>
  );

  const number = (key: "withinDays" | "gddUnder", label: string, unit: string) => (
    <div className="flex min-h-11 items-center gap-2 px-2 text-[13px]">
      <label htmlFor={`lf-${key}`} className="flex-1">{label}</label>
      <input id={`lf-${key}`} inputMode="numeric" value={value[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<Filter>)}
        className={`${FIELD} w-20`} />
      <span className="data w-12 text-[11px] text-ink-soft">{unit}</span>
    </div>
  );

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={active ? `Filtered: ${summarise(value)}` : "Filter the ledger"}
        className={`flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[12px] ${
          active ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"
        }`}
      >
        <Glyph path={ICON.filter} size={16} />
        {/* What is on, when something is — so a short list is never a
            mystery. Nothing at all when nothing is. */}
        {active && <span className="data max-w-[12rem] truncate">{summarise(value)}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-rule bg-panel p-2 shadow-lg">
          {check("readyBeforeFrost", "Ready before frost")}
          {check("hasSeed", "Has seed")}
          {number("withinDays", "Projected within", "days")}
          {number("gddUnder", "Heat left under", "GDD")}
          {active && (
            <button onClick={() => onChange({
              readyBeforeFrost: false, hasSeed: false, withinDays: "", gddUnder: "",
            })}
              className="mt-1 min-h-11 w-full rounded px-2 text-left text-[12px] text-ink-soft active:bg-band">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
