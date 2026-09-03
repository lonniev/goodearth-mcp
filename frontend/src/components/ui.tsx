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
export function Section({ emoji, title, first, children }: {
  emoji: string; title: string; first?: boolean; children?: ReactNode;
}) {
  return (
    <h2 className={`figure mb-2.5 flex flex-wrap items-baseline gap-2.5 text-[18px] font-semibold ${
      first ? "" : "mt-7"
    }`}>
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

/// A species chiclet, carrying the animal's own photograph.
///
/// One emoji per class made a barred owl and a chickadee the same bird.
/// iNaturalist ships a photo per taxon, so the picture is sourced rather
/// than chosen — and the emoji stays as the fallback for a species whose
/// photo is missing or fails to load.
export function SpeciesChiclet({
  photo, emoji, name, figure, marked, title, onClick,
}: {
  photo?: string | null; emoji: string; name: string;
  figure?: ReactNode; marked?: boolean; title?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-[12.5px] active:border-ink ${
        marked ? "border-growth/45 bg-growth/8" : "border-rule bg-panel"
      }`}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">{emoji}</span>
      )}
      <span className="font-medium">{name}</span>
      {figure != null && <span className="data text-[10.5px] text-ink-soft">{figure}</span>}
    </button>
  );
}

/// A standalone chip that reports a state rather than inviting a tap.
///
/// The site has two pill families: small borderless badges that annotate
/// something else ("now", "won't fit"), and chiclet-sized bordered pills that
/// are objects in their own right. A pest's stage chips had the SIZE of the
/// second and the STYLING of the first, so they read as chiclets that had
/// lost their borders. This is the second family, minus the tap — same
/// geometry and the same tone treatment the crop library uses, so a reached
/// stage and a comfortable crop are recognisably the same kind of mark.
/// Not min-h-11. That is a TOUCH TARGET, and this cannot be touched — it
/// inherited the height from Chiclet and made every row it sat in twice as
/// tall as the equivalent row on the other pages.
export function StatusChip({ tone, children }: {
  tone?: "reached" | "pending"; children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] ${
        tone === "reached" ? "border-honey/50 bg-honey/8" : "border-rule bg-paper text-ink-soft"
      }`}
    >
      {children}
    </span>
  );
}

/// A compact action: an icon and a word, the way a phone keyboard's toolbar
/// does it.
///
/// This replaces the sentence-shaped buttons the pages had grown — "Add to the
/// ledger", "Start watching", "Track it" — three different sentences for one
/// act, each a full-width row at the bottom of a form. The icon carries the
/// meaning and the word disambiguates it, which is the whole of the Material
/// pattern and also what `feedback: icons > labels` asks for.
///
/// `form` is what lets it sit in the header row above the form it submits: a
/// button outside a <form> can still be its submit button by naming its id.
export function IconButton({
  path, label, onClick, form, title, tone = "solid", disabled,
}: {
  /// A 24×24 SVG path. One concept, one icon.
  path: string;
  label: string;
  onClick?: () => void;
  /// The id of the <form> this submits. Given one, it becomes type="submit".
  form?: string;
  title?: string;
  tone?: "solid" | "quiet";
  disabled?: boolean;
}) {
  const solid = tone === "solid";
  return (
    <button
      type={form ? "submit" : "button"}
      form={form}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold disabled:opacity-40 ${
        solid
          ? "border-[1.5px] border-ink bg-ink text-paper"
          : "border border-rule font-medium text-ink-soft active:bg-band"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d={path} />
      </svg>
      {label}
    </button>
  );
}

/// The 24×24 paths this app uses, named for what they mean rather than what
/// they look like — so "one concept, one icon" is checkable by reading.
export const ICON = {
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  settings:
    "M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z",
  ask: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26A1.95 1.95 0 0 0 12 7a2 2 0 0 0-2 2H8a4 4 0 1 1 8 0c0 .88-.36 1.68-.93 2.25z",
} as const;

/// The ✓ and × that close a row being edited.
///
/// Shared because getting them wrong is uniform: an editor that can only be
/// dismissed with the mouse is slower than the form it replaced, so every
/// caller also binds Enter and Escape on its own fields.
export function RowActions({ onCommit, onCancel, saving, what }: {
  onCommit: () => void; onCancel: () => void; saving?: boolean; what: string;
}) {
  return (
    <>
      <button onClick={onCommit} disabled={saving} aria-label={`Save ${what}`}
        className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-growth disabled:opacity-40">✓</button>
      <button onClick={onCancel} aria-label="Cancel"
        className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
    </>
  );
}

/// The cell style inside a row being edited. One definition, four editors.
export const CELL =
  "w-full rounded border border-rule bg-white px-2 py-1 text-[16px] focus:border-honey focus:outline-none";
