// The shared furniture of a Good Earth page.
//
// Crops, Pests and Wildlife ask the same shape of question — here is what
// you have set, here is what this ground says about it, here is a catalogue
// to start from — and they had drifted into three dialects of it: two title
// sizes, two heading styles, four copies of one input class string, and
// starter pills that looked nothing like the crop chiclets beside them.
//
// These are the pieces they now share. A page composes them; it does not
// restate them. Where a difference remains it should be because the content
// differs, not because someone typed the class list again.

import type { ReactNode } from "react";

/// One field style, for every text and date input on every page.
///
/// The date input is why this is shared rather than copied: Safari sizes it
/// from its own shadow content and ignores the height, so a copied class
/// string left it visibly shorter than its neighbours on every form that had
/// one. The -webkit-date-and-time rules are the fix, and they only work if
/// there is one definition to put them in.
export const FIELD = [
  "mt-0.5 h-11 w-full appearance-none rounded border border-rule bg-white px-2.5",
  "text-[16px] text-ink focus:border-honey focus:outline-none",
  "[&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:h-full",
  "[&::-webkit-date-and-time-value]:text-left",
  "[&::-webkit-calendar-picker-indicator]:opacity-50",
].join(" ");

/// The page's name. The rail says which view this is and the region picker
/// says which ground, so neither is repeated here.
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="figure mb-3.5 text-[22px] font-bold">{children}</h1>;
}

/// A section heading, with room for the action that fills it and the
/// provenance of the answer it produced.
export function Section({ emoji, title, children }: {
  emoji: string; title: string; children?: ReactNode;
}) {
  return (
    <h2 className="figure mt-7 mb-2.5 flex flex-wrap items-baseline gap-2.5 text-[18px] font-semibold">
      <span className="mr-0.5">{emoji}</span>{title}
      {children}
    </h2>
  );
}

/// The round action/filter pill: a tab, a toggle, or a question to the
/// service. Dark when it is the active one.
export function Pill({ active, onClick, disabled, title, children }: {
  active?: boolean; onClick?: () => void; disabled?: boolean;
  title?: string; children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-h-11 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium disabled:opacity-40 ${
        active ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"
      }`}
    >
      {children}
    </button>
  );
}

/// A catalogue entry: icon, name, figure, and whatever marks the page adds.
/// This is the shape the crop library established and the other pages copy,
/// so a starter and a crop read as the same kind of thing.
export function Chiclet({ emoji, name, figure, tone, title, onClick, children }: {
  emoji: string; name: string; figure?: ReactNode; tone?: string;
  title?: string; onClick?: () => void; children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] active:border-ink ${
        tone || "border-rule bg-panel"
      }`}
    >
      <span>{emoji}</span>
      <span className="font-medium">{name}</span>
      {figure != null && <span className="data text-[10.5px] text-ink-soft">{figure}</span>}
      {children}
    </button>
  );
}

/// Nothing here yet — said without implying anything is broken.
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-rule bg-panel/60 p-6 text-[13px] text-ink-soft">
      {children}
    </div>
  );
}

/// The standing caveat under a catalogue. Spans the width it is given.
export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">{children}</p>;
}

/// A failed call, said in the page rather than in a console.
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">
      {children}
    </div>
  );
}
