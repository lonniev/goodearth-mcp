// The share button in the top bar, and the sheet it opens.
//
// A page says what it has to give with `useShare(sheet)`; the button beside
// the (?) appears while a page has something, and opens the same dialog
// whatever the page: a preview of the table, braces to copy it as JSON, two
// pages to copy it as text. The Almanac had this on its own terms — a
// paper-plane button in its heading that opened a prose summary with one
// copy control — and nothing else exported at all.
//
// Two contexts rather than one. A view only ever SETS the sheet and the
// button only ever READS it; sharing one value would re-render every view
// each time it published, and a view that rebuilt its sheet on render would
// then publish again — a loop with a frame in it.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { sheetJSON, sheetText, type Sheet } from "../lib/exports";
import { Glyph, ICON } from "./ui";

const Read = createContext<Sheet | null>(null);
const Set_ = createContext<(s: Sheet | null) => void>(() => {});

export function ShareProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  return (
    <Set_.Provider value={setSheet}>
      <Read.Provider value={sheet}>{children}</Read.Provider>
    </Set_.Provider>
  );
}

/// What this page has to give, or null while it has nothing yet. Pass a
/// memoised sheet: it is published whenever it changes and withdrawn when
/// the page leaves.
export function useShare(sheet: Sheet | null) {
  const set = useContext(Set_);
  useEffect(() => { set(sheet); }, [sheet, set]);
  useEffect(() => () => set(null), [set]);
}

export function ShareButton() {
  const sheet = useContext(Read);
  const [open, setOpen] = useState(false);
  if (!sheet) return null;
  const label = `Share ${sheet.title}`;
  return (
    <>
      <button type="button" aria-label={label} title={label}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-rule text-ink-soft active:bg-band">
        <Glyph path={ICON.shareUp} />
      </button>
      {open && <ShareSheet sheet={sheet} onClose={() => setOpen(false)} />}
    </>
  );
}

/// Put text on the clipboard, or fail honestly. A write can be refused — an
/// insecure context, a browser that wants a fresher gesture — and a tick
/// that lies is worse than a prompt the grower can copy from by hand.
async function toClipboard(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt(`Copy ${what}:`, text);
    return false;
  }
}

function ShareSheet({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<"text" | "json" | null>(null);

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function copy(kind: "text" | "json") {
    const ok = kind === "json"
      ? await toClipboard(sheetJSON(sheet), `${sheet.title} as JSON`)
      : await toClipboard(sheetText(sheet), `the ${sheet.title} table`);
    if (!ok) return;
    setDone(kind);
    setTimeout(() => setDone(null), 1600);
  }

  // A function, not a component: a component declared in render remounts
  // each time, which would drop the tick mid-way.
  const copyButton = (kind: "text" | "json", path: string, label: string) => (
    <button onClick={() => void copy(kind)} title={label} aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-rule text-ink-soft active:bg-band">
      {done === kind
        ? <span className="text-[16px] text-growth" aria-hidden="true">✓</span>
        : <Glyph path={path} size={20} />}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[900] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${sheet.title}`}
    >
      <div
        ref={box}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-xl border border-rule bg-panel p-5 shadow-xl outline-none sm:rounded-xl"
      >
        <div className="flex items-start gap-3">
          <span className="text-[30px] leading-none" aria-hidden="true">{sheet.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{sheet.eyebrow}</div>
            <h2 className="figure text-[20px] font-semibold leading-tight">{sheet.title}</h2>
          </div>
          {copyButton("json", ICON.braces, "Copy as JSON")}
          {copyButton("text", ICON.copy, "Copy the table")}
          <button onClick={onClose} aria-label="Close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-ink">×</button>
        </div>

        {/* The preview is the table itself, as the copy will read. It scrolls
            both ways inside the sheet: eight columns of plantings do not fit
            a phone, and the heading and buttons stay put above them. */}
        {sheet.rows.length ? (
          <div className="mt-4 min-h-0 overflow-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {sheet.head.map((h) => (
                    <th key={h} className="data sticky top-0 border-b-[1.5px] border-ink bg-panel px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-[.1em] whitespace-nowrap text-ink-soft">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((r, i) => (
                  <tr key={i} className="border-b border-rule last:border-b-0 align-top">
                    {r.map((c, j) => (
                      <td key={j} className={`px-2 py-1.5 ${j === 0 ? "font-medium" : "data text-ink-soft"} ${
                        typeof c === "string" && c.length > 40 ? "min-w-[14rem]" : "whitespace-nowrap"}`}>
                        {c == null || c === "" ? "" : String(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-ink-soft">Nothing on this page yet.</p>
        )}

        {sheet.foot && (
          <p className="mt-3 shrink-0 text-[11.5px] text-ink-soft">{sheet.foot}</p>
        )}
      </div>
    </div>
  );
}
