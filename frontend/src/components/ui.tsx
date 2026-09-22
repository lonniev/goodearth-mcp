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

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Term from "./Term";

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
/// The frame a chart is being drawn in: whether it is full screen, and how
/// much height it has been given.
///
/// A chart cannot ask its own frame otherwise, and it needs to: these plots
/// carry a FIXED viewBox aspect, so filling the width of a full screen makes
/// them wider and no taller. The height went unused.
///
/// `slotH` is the frame's OWN measurement of the space left after its header,
/// and it is the number that matters. The chart used to work it out from
/// `window.innerHeight - card.top` — but the card is vertically centred, so
/// its top moved with its height, which moved with the plot's height. That
/// loop has a fixed point, and the fixed point left about 80 px of slack
/// split evenly above and below. It converged on being wrong.
export interface ChartSlot { full: boolean; slotH: number }

const Frame = createContext<ChartSlot>({ full: false, slotH: 0 });

export function useChartFrame(): ChartSlot {
  return useContext(Frame);
}

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

  // The slot is measured rather than inferred: `flex-1 min-h-0` makes its
  // height exactly what the header left over, whatever the chart puts in it.
  const slot = useRef<HTMLDivElement>(null);
  const [slotH, setSlotH] = useState(0);
  useLayoutEffect(() => {
    if (!open) { setSlotH(0); return; }
    const measure = () => { if (slot.current) setSlotH(slot.current.clientHeight); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  return (
    <div className={open
      // `overflow-hidden` on the panel and `overflow-auto` on the slot, so the
      // slot's height is decided by the layout and never by its contents.
      ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper px-2 pt-1.5 pb-0"
      : "relative"}>
      {open && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="figure text-[15px] font-semibold">{label}</span>
          <span className="data text-[10.5px] text-ink-soft">Esc to close</span>
          {/* Beside the title, not at the foot of the page. A close control
              parked below a short chart sat alone in half a screen of nothing,
              nowhere near where the eye goes to leave. */}
          <button type="button" onClick={() => setOpen(false)}
            title={`Close ${label}`} aria-label={`Close ${label}`}
            className="ml-auto inline-flex h-8 w-11 items-center justify-center rounded text-ink-soft active:bg-band">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d={ICON.collapse} />
            </svg>
          </button>
        </div>
      )}

      {/* Full screen buys BOTH axes now. It used to buy only width: the plots
          carry a fixed viewBox aspect, so a wider box was a proportionally
          taller one and the rest of the screen was shared out as blank margin
          above and below. A chart that reads `useChartFullscreen` picks a
          taller box instead and uses the height it was given. One that does
          not is still centred, exactly as before. */}
      <div ref={slot}
        className={open ? "min-h-0 flex-1 overflow-auto" : ""}>
        <div className={open ? "w-full" : ""}>
          <Frame.Provider value={{ full: open, slotH }}>{children}</Frame.Provider>
        </div>
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
  path, label, onClick, form, title, tone = "solid", disabled, hideLabel,
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
  /// Show the glyph alone. The label is still REQUIRED and still reaches a
  /// screen reader and the tooltip — hiding it is a visual decision, not a
  /// licence to ship a button that announces itself as nothing.
  hideLabel?: boolean;
}) {
  const solid = tone === "solid";
  return (
    <button
      type={form ? "submit" : "button"}
      form={form}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={hideLabel ? label : undefined}
      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full text-[12.5px] font-semibold disabled:opacity-40 ${
        hideLabel ? "w-11 justify-center px-0" : "px-3.5"
      } ${
        solid
          ? "border-[1.5px] border-ink bg-ink text-paper"
          : "border border-rule font-medium text-ink-soft active:bg-band"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d={path} />
      </svg>
      {!hideLabel && label}
    </button>
  );
}

/// The 24×24 paths this app uses, named for what they mean rather than what
/// they look like — so "one concept, one icon" is checkable by reading.
export const ICON = {
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  // Material Design "delete" — the bin. Recognised without a word beside
  // it, which is the whole reason a destructive action gets a glyph.
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  // Material Design "save" — the floppy. The one glyph every toolbar has
  // agreed on, which is the whole reason to use theirs rather than draw one.
  save: "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z",
  // Material Design "edit_off" — the pencil struck through. Abandoning an
  // edit. It was a ×, which is also what removed a row: one glyph for two
  // opposite acts, beside each other.
  cancelEdit: "M12.126 8.125l1.937-1.937 3.747 3.747-1.937 1.938zM20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L20.71 7a1 1 0 0 0 0-1.37zM2 5l6.63 6.63L3 17.25V21h3.75l5.63-5.62L18 21l2-2L4 3 2 5z",
  // Material Design Icons "seed" — a packet, and the plant it is seed of.
  // It was 🌰, a chestnut: a nut, not a seed, and in Apple's colours beside
  // glyphs in the page's ink.
  seed: "M20.7,3.3C20.7,3.3 19.3,3 17.2,3C11.7,3 1.6,5.1 3.2,20.8C4.3,20.9 5.4,21 6.4,21C24.3,21 20.7,3.3 20.7,3.3M7,17C7,17 7,7 17,7C17,7 11,9 7,17Z",
  // Material Design Icons "bug" — watching a creature. The button said the
  // word "Pest" beside a plus, which is a label doing a glyph's work in a row
  // where every other control had already given its word up.
  bug: "M14 12h-4v-2h4m0 6h-4v-2h4m6-6h-2.81a6 6 0 0 0-1.82-1.96L17 4.41L15.59 3l-2.17 2.17a6 6 0 0 0-2.83 0L8.41 3L7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20z",
  // Material Design Icons "seed-outline" — the same seed, empty.
  //
  // Shape carries this, not colour. The two states were one filled glyph in
  // two inks, and `ink-soft` is a desaturated olive that at 18px is all but
  // the growth green beside it — a distinction only its author could see.
  // Empty and full read at a glance whatever the hue, and still do for a
  // reader who cannot tell the two greens apart at all.
  seedOutline: "M17.2 5c.6 0 1.2 0 1.7.1c.2 2.3.2 6.9-2.5 10.1c-2 2.5-5.4 3.8-10 3.8H5.1c-.2-4.6.7-8.2 2.8-10.5C10.4 5.6 14.4 5 17.2 5m0-2c-5.5 0-15.6 2.1-14 17.8c1.1.1 2.2.2 3.2.2C24.3 21 20.7 3.3 20.7 3.3S19.3 3 17.2 3M17 7C7 7 7 17 7 17C11 9 17 7 17 7",
  // Game Icons "gardening-shears" by Lorc/Delapouite et al., CC BY 3.0 —
  // credited on the References page. Secateurs, with the curved beak blade and
  // the pivot bolt that tell them apart from a pair of office scissors, which
  // is the whole point: plain scissors on a row of actions read as "delete
  // this", and taking a cut of a plant is the opposite of removing it.
  //
  // Drawn on a 512 grid and at 24px rather than 18 — measured, not chosen. At
  // 18 it is a scratch; at 24 the blade, the bolt and both handles are there.
  shears: "M139.8 24.96C155.9 88.06 182 124.7 197 141.5l1.2 1.3l1.6.9c16.4 8 26.8 24.7 26.8 43c0 26.6-21.4 48-48.1 48c-26.6 0-48-21.4-48-48c0-8.6 2.3-16.9 6.6-24.4l2.9-5l-3.2-4.9c-18.1-27.1-19.7-51.4-14.6-76.74c3.3-16.6 10.2-33.6 17.6-50.7m121 114.64c7.6.1 14.9 1.3 20.9 4c4 8.1 6.2 18.7 10.6 29.1c2.5 5.6 5.9 11.4 11.6 15.6c5.4 4 12.5 6.1 20.4 6c56.5 10.3 92.3 26.4 116.3 45.4c24.2 18.9 37 40.9 46.9 64.8v.1c1.7 3.9 1.3 6.4-.1 9.2c-1.5 3-4.6 6-8.4 8.1c-3.9 2.1-8.5 3.1-12.1 3c-3.5-.2-5.8-1.3-7.4-3.1c-12.2-14.9-27-35.3-45.5-51.7c-18.6-16.4-41.9-29.1-69.5-25.9c-21.2 2.4-33.1-6.4-50.4-16.8c-13.5-8.1-30.1-16.6-52.9-17.6c2.7-7.2 4.2-15 4.2-23.1c0-16.3-6-31.6-16.2-43.5c5.6-1 11.7-2.3 18.1-3c3.4-.3 6.8-.6 10.2-.6zM23.39 156.8c27.5 9.1 56.6 17.2 90.11 14.8c-1.1 4.9-1.8 10-1.8 15.1c0 15.4 5.4 29.7 14.2 41.1c-28.81-.2-48.71-10.4-66.11-26.2c-13.3-12.2-24.9-28.2-36.4-44.8m155.11 3.8c-14.3 0-26.1 11.8-26.1 26.1s11.8 26.1 26.1 26.1s26.1-11.8 26.1-26.1s-11.8-26.1-26.1-26.1m0 18.8c4.2 0 7.4 3.1 7.4 7.3c0 4.1-3.2 7.3-7.4 7.3c-4.1 0-7.3-3.2-7.3-7.3c0-4.2 3.2-7.3 7.3-7.3m25.8 69c6.3 52.6 26.9 87.3 51.2 113.8c26.8 29.2 57.1 49.7 78.7 77.3c1.2 3.3 2 10.1 1.2 17.3c-1 7.7-3.5 16-6.9 21.8c-3.4 5.6-6.9 8.1-10.1 8.4c-3 .3-8.6-1.3-17-10.5c-18-33.3-53.7-84.8-100.9-107.4c-18.7-9-27.6-21.7-32.3-37c-4.6-15.2-4.5-33.2-2.9-50.1c1.2-13.9-1.5-23.8-4.7-31c5.7 1.7 11.7 2.5 17.9 2.5c9.1 0 17.9-1.9 25.8-5.1",
  // Material Design "share" — handing a plot to another patron as a bundle.
  share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
  // Material Design "file_upload" — bringing a bundle in as a plot.
  upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  // Material Design "edit" — the pencil. Renaming a plot and its other names.
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  expand: "M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z",
  collapse: "M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z",
  search:
    "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  settings:
    "M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z",
  ask: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26A1.95 1.95 0 0 0 12 7a2 2 0 0 0-2 2H8a4 4 0 1 1 8 0c0 .88-.36 1.68-.93 2.25z",
} as const;

/// The bin that removes a row. Every ledger's delete, so a grower learns it
/// once. It was a ×, the same glyph that abandoned an edit in the same column.
/// One glyph, drawn from the same set as the rest and in the same ink.
///
/// A colour emoji beside monochrome Material glyphs reads as something
/// pasted in from elsewhere, and it cannot take the ink of the button it
/// sits in — so a row's actions were half in the page's colours and half in
/// Apple's.
export function Glyph({ path, size = 18, grid = 24 }: {
  path: string;
  size?: number;
  /// The square the path was drawn on. Material's own are 24; a glyph borrowed
  /// from a set that draws at 512 says so rather than being rescaled by hand.
  grid?: number;
}) {
  return (
    <svg viewBox={`0 0 ${grid} ${grid}`} style={{ width: size, height: size }}
      fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function TrashGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
      <path d={ICON.delete} />
    </svg>
  );
}

/// The ✓ that saves a row being edited, and the struck-through pencil that
/// abandons the edit.
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
      <button onClick={onCancel} aria-label="Cancel edit" title="Cancel edit"
        className="inline-flex h-11 w-11 items-center justify-center text-ink-soft active:text-ink">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
          <path d={ICON.cancelEdit} />
        </svg>
      </button>
    </>
  );
}

/// One labelled control in a row of them that has to line up.
///
/// A form reads as careless the moment its captions sit at three heights and
/// its boxes at four. That is not carelessness in the writing, it is what
/// happens when each field wears its own label markup and the browser gives a
/// date input, a select and a text box three different intrinsic heights.
///
/// So the caption row is a FIXED height whatever it holds — a word, or a word
/// and a "look it up" beside it — and every control inside is `FIELD`, which
/// is a fixed height too. Alignment is then a property of the component
/// rather than a thing to get right ten times.
export function Field({ label, htmlFor, width, hint, children }: {
  label: string;
  /// Given, the caption is a real <label> pointing at the control. Omitted,
  /// the caption is plain text — for a control that labels itself, or one a
  /// label may not wrap (see labelNesting.test.ts).
  htmlFor?: string;
  /// A Tailwind width class. Fields are as wide as what goes in them.
  width?: string;
  /// Something small to the right of the caption, on the same fixed row.
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className={`flex flex-col ${width ?? "flex-1"}`}>
      <span className="flex h-4 items-center gap-2 text-[11px] leading-none text-ink-soft">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {hint}
      </span>
      {children}
    </span>
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
  // Only the caption is a label element. The − and + are buttons, and a tap inside a
  // label can be handed to its input instead — the thumb meant "one more" and
  // got a keyboard.
  return (
    <div className="block text-[11px] text-ink-soft">
      <label htmlFor={id}>{label}</label>
      <span className="mt-0.5 flex items-stretch overflow-hidden rounded border border-rule bg-white">
        <button type="button" onClick={() => nudge(-step)} aria-label={`${label} down`}
          className="w-11 shrink-0 text-[18px] text-ink-soft active:bg-band">−</button>
        <input id={id} value={value} inputMode="numeric" aria-label={id ? undefined : label}
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
    </div>
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


/// A published life cycle, as a glyph rather than as the words "has a year".
///
/// Those words were on every marked row, in the finder's legend, in the page's
/// hint and on the species card — four places saying one thing, and "has a
/// year" is not a phrase anybody uses out loud.
///
/// It carries the glossary's own explanation, so wherever the glyph appears it
/// can be asked what it means. That is the point of it living here: three
/// copies of a glyph is three chances for one of them to be a bare emoji
/// nobody can interrogate.
export const LIFECYCLE = "\u{1F504}";

export function LifecycleMark() {
  return <Term label={<span aria-hidden="true">{LIFECYCLE}</span>} of="has_a_year" />;
}
