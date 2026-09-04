// A word the page uses, and what it means, revealed on demand.
//
// Doctrine is that explanations live in a tooltip and not on the page. The
// `title` attribute is not that tooltip: it needs a hovering mouse, and this
// site is read on a tablet in a shed, where the definition simply never
// appears. So this is a real disclosure — tap the word, get the sentence, tap
// again or press Escape and it is gone.
//
// It exists so that "biofix", "threshold" and "base temperature" can stay on
// screen as the single words they are, instead of dragging a paragraph of
// explanation onto a dashboard behind them.

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Term({ label, children }: {
  /// The word being defined. Omit for a bare ⓘ beside a label that is
  /// already there — a column header, say, which cannot hold a second word.
  label?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={label
          ? "cursor-help border-b border-dotted border-ink-soft/70 text-left"
          : "ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-rule text-[9px] leading-none text-ink-soft align-middle"}
      >
        {label ?? "i"}
      </button>
      {open && (
        <span
          role="tooltip"
          // Right-anchored: these sit in table headers and form labels near
          // the right edge, where a left-anchored panel runs off the screen.
          className="absolute top-full right-0 z-30 mt-1 w-64 rounded-md border border-rule bg-paper p-2.5 text-[12px] leading-snug font-normal normal-case tracking-normal text-ink shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
