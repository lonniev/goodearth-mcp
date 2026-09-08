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

import { useEffect, useState, type ReactNode } from "react";

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

/// Any chart, with a corner that takes it full screen.
///
/// A season chart is 740 units wide by design and a phone is not, so the one
/// on screen is always a compromise. This is the way out of it, and it is the
/// same control on every chart on every page rather than a thing the Almanac
/// happens to have.
///
/// **The children never remount.** Only this element's classes change, so a
/// chart carries its zoom and pan into full screen and back out again. Swapping
/// the subtree instead — rendering the chart in an overlay — would unmount it,
/// and a grower who had zoomed into July would land back at the whole season
/// for the crime of wanting a better look.
export function ChartFrame({ label, children }: {
  label: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    // The page behind must not scroll under the overlay.
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = had;
    };
  }, [open]);

  return (
    <div className={open
      ? "fixed inset-0 z-50 flex flex-col gap-2 overflow-auto bg-paper p-3"
      : "relative"}>
      {open && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="figure text-[16px] font-semibold">{label}</span>
          <span className="data text-[11px] text-ink-soft">Esc to close</span>
          {/* Beside the title, not at the foot of the page. A close control
              parked below a short chart sat alone in half a screen of nothing,
              nowhere near where the eye goes to leave. */}
          <button type="button" onClick={() => setOpen(false)}
            title={`Close ${label}`} aria-label={`Close ${label}`}
            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded text-ink-soft active:bg-band">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d={ICON.collapse} />
            </svg>
          </button>
        </div>
      )}

      {/* Centred rather than stretched. These charts are drawn wide and short
          — 740 units by 150 — so filling the height would either distort them
          or run them off the sides. Full screen buys the WIDTH, which is the
          axis a season is long in; the space it cannot use is shared top and
          bottom instead of dumped underneath. */}
      <div className={open ? "flex min-h-0 flex-1 items-center" : ""}>
        <div className={open ? "w-full" : ""}>{children}</div>
      </div>

      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          title={`${label} full screen`} aria-label={`${label} full screen`}
          className="absolute right-1 top-1 z-10 inline-flex h-11 w-11 items-center justify-center rounded text-ink-soft active:bg-band">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d={ICON.expand} />
          </svg>
        </button>
      )}
    </div>
  );
}

/// The small mark that stands for one creature or plant, in a list.
///
/// Three sources, in the order they deserve. The grower's own emoji, where
/// they typed one for that row — they chose it and it is theirs. Then
/// iNaturalist's photograph of the taxon, which is why a barred owl and a
/// chickadee are no longer the same bird. Then a seedling.
///
/// Never a bullet. A row that carried no emoji used to draw "•", which says
/// nothing about the animal it stands for and reads as an outline marker
/// beside rows that have a picture.
export function SpeciesMark({ emoji, photo }: {
  emoji?: string | null; photo?: string | null;
}) {
  if (emoji) {
    return <span className="mr-1.5 text-[15px]" aria-hidden="true">{emoji}</span>;
  }
  if (photo) {
    return (
      <img src={photo} alt="" loading="lazy" width={20} height={20}
        className="mr-1.5 inline-block h-5 w-5 rounded-full object-cover align-[-4px]"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
    );
  }
  return <span className="mr-1.5 text-[15px]" aria-hidden="true">{"\u{1F331}"}</span>;
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
  expand: "M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z",
  collapse: "M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z",
  search:
    "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
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

/// A number the grower steps to rather than types.
///
/// Husbandry counts are small integers a thumb can reach — 21 days, 147 days,
/// a base temperature — and a bare text box invites "twenty-one", an empty
/// string, and a stray letter. The field still accepts direct entry, because
/// stepping from 1 to 147 with a thumb is its own cruelty; what it will not
/// accept is a value outside the range it was given.
export function Stepper({
  value, onChange, min = 1, max = 1000, step = 1, unit, label, id,
}: {
  value: number | "";
  onChange: (n: number | "") => void;
  min?: number; max?: number; step?: number;
  unit?: string; label: string; id?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const nudge = (by: number) =>
    onChange(clamp((typeof value === "number" ? value : min) + by));
  return (
    <label className="block text-[11px] text-ink-soft" htmlFor={id}>
      {label}
      <span className="mt-0.5 flex items-stretch overflow-hidden rounded border border-rule bg-white">
        <button type="button" onClick={() => nudge(-step)} aria-label={`${label} down`}
          className="w-11 shrink-0 text-[18px] text-ink-soft active:bg-band">−</button>
        <input id={id} value={value} inputMode="numeric"
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) return onChange("");
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => { if (typeof value === "number") onChange(clamp(value)); }}
          className="data min-w-0 flex-1 border-x border-rule px-2 py-2 text-center text-[16px] focus:outline-none" />
        <button type="button" onClick={() => nudge(step)} aria-label={`${label} up`}
          className="w-11 shrink-0 text-[18px] text-ink-soft active:bg-band">+</button>
      </span>
      {unit && <span className="mt-0.5 block text-[10.5px] text-ink-soft">{unit}</span>}
    </label>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
/// February gets 29. A date that only exists in a leap year is the grower's to
/// choose, and the server already answers "—" for the years it does not.
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/// A day of the year with no year on it, picked rather than typed.
///
/// `typical_on` is stored as MM-DD and the form used to ask for it in exactly
/// those words, in a text box. That is the typed date this app is trying to be
/// rid of: it invites "Sept 5", "9/5" and "05-09", and only one of those is
/// the thing the record wanted.
export function MonthDay({ value, onChange, label }: {
  value: string; onChange: (mmdd: string) => void; label: string;
}) {
  const [mm, dd] = /^\d{2}-\d{2}$/.test(value)
    ? value.split("-").map(Number) : [0, 0];
  const set = (m: number, d: number) => {
    if (!m || !d) return onChange("");
    onChange(`${String(m).padStart(2, "0")}-${String(Math.min(d, DAYS_IN[m - 1])).padStart(2, "0")}`);
  };
  return (
    <span className="block text-[11px] text-ink-soft">
      {label}
      <span className="mt-0.5 flex gap-1.5">
        <select value={mm || ""} onChange={(e) => set(Number(e.target.value), dd || 1)}
          aria-label={`${label} — month`} className={`${FIELD} flex-1`}>
          <option value="">month…</option>
          {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <select value={dd || ""} onChange={(e) => set(mm || 1, Number(e.target.value))}
          aria-label={`${label} — day`} className={`${FIELD} w-24`}>
          <option value="">day…</option>
          {Array.from({ length: DAYS_IN[(mm || 1) - 1] }, (_, i) => i + 1)
            .map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </span>
    </span>
  );
}
