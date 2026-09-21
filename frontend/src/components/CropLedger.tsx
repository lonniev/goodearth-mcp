// The crop ledger — every planting on the block, and whether it finishes.
//
// The bar is heat-to-target, not calendar progress, because that is the clock
// the plant is actually on. A row that will not finish is called out in clay
// rather than left for the reader to compute from two dates.
//
// **The rows are the RECORD, and the computed status decorates them.** It used
// to be the other way round: the table iterated the server's computed rows, so
// a planting the server could not evaluate — no set-out, no heat target — was
// stored, sent, correctly classified as untracked, and then dropped on the
// floor here. The grower saw an empty ledger listing none of the choices they
// had just made, which reads as data loss when nothing was lost.
//
// Perennials are why that is the ordinary case and not an edge one. An apple
// tree has no heat target anyone counts and no set-out this season; "it grows
// here" is a true thing to record. Such a row shows as presence — named, and
// honest about what it would need — rather than given a fabricated zero that
// would then propagate into every projection.
//
// Order and paging are the DATABASE's. It sorts every planting on the block
// rather than the ones on this page, which is the difference between "your
// earliest set-out" and "the earliest set-out among these twenty".

import { Fragment, useState } from "react";
import { useUnits } from "./Units";
import type { CropWatch } from "../lib/diseaseRows";
import { describeHarvest, UNITS, type HarvestInput, type HarvestSummary } from "../lib/harvests";
import { newItemId } from "../lib/submit";
import type { PlantingStatus } from "../lib/mcp";
import { SEEDLING, type Planting } from "../lib/plantings";
import { lotLine, onHand, type SeedLot } from "../lib/seeds";
import SeedForm from "./SeedForm";
import { SortHeaders, type Column } from "./RecordTable";
import { CELL, Field, FIELD, Glyph, ICON, RowActions, TrashGlyph } from "./ui";
import QuantityField from "./QuantityField";
import type { ItemSort } from "../lib/blockItems";
import { baseBounds } from "../lib/baseTemp";

const STATUS: Record<string, { label: string; cls: string }> = {
  past_target:     { label: "Past target",  cls: "bg-growth/15 text-growth" },
  on_pace:         { label: "On pace",      cls: "bg-band text-ink-soft" },
  stalled:         { label: "Stalled",      cls: "bg-band text-ink-soft" },
  not_yet_planted: { label: "Not yet out",  cls: "bg-band text-ink-soft" },
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  wont_finish: { label: "Won't finish", cls: "bg-clay/15 text-clay" },
  finishes:    { label: "Finishes",     cls: "bg-growth/10 text-growth" },
  finished:    { label: "Done",         cls: "bg-growth/15 text-growth" },
  unknown:     { label: "Unknown",      cls: "bg-band text-ink-soft" },
};

const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/// One line of the ledger: what the grower saved, and whatever the season had
/// to say about it. `status` is absent for a planting nothing can be computed
/// for, and `reason` then says which half it is missing.
export interface LedgerRow {
  planting: Planting;
  status?: PlantingStatus;
  reason?: string;
  /// Models whose own "developed for" list names this crop, and which are
  /// reporting risk. Beside the crop, because that is where a grower looking
  /// at their plantings would look for it.
  watch?: CropWatch[];
  /// What it has actually given this season — beside what it was projected to.
  harvest?: HarvestSummary;
}

/// Recording a cut, handed in by the page: which planting the form is open
/// on, the unit to offer, and the save, which answers with a reason if it
/// could not take the cut.
export interface Harvesting {
  open: string;
  onOpen: (p: Planting) => void;
  onClose: () => void;
  unitFor: (crop: string) => string | undefined;
  onSave: (p: Planting, h: HarvestInput, id: string) => Promise<string | null>;
}

/// Seed, handed in by the page: which planting the row is open on, this
/// plant's packets, and the two writes — one onto the planting, one onto the
/// shelf.
///
/// A plant's sowing date and the packet it came from are stated here, in the
/// plant's own row, because they are facts ABOUT the plant. They were a
/// section of their own, with a dropdown re-picking a plant the page already
/// had on screen.
export interface Seeding {
  open: string;
  onOpen: (p: Planting) => void;
  onClose: () => void;
  /// The packets that are seed of this plant.
  lotsFor: (p: Planting) => SeedLot[];
  /// The sowing date and the packet, written onto the planting. Either may be
  /// empty: a clove has a day and no packet.
  onBind: (p: Planting, sownOn: string, seedLotId: string) => Promise<string | null>;
  onSaveLot: (p: Planting, lot: SeedLot) => Promise<string | null>;
  onRetireLot: (lot: SeedLot) => void;
  saving?: boolean;
}

const COLS: Column<ItemSort>[] = [
  { key: "name", label: "Plant" },
  { key: "starts_on", label: "Set out" },
  { key: "target_gdd", label: "Heat to target", width: "34%",
    info: <>Growing degree days this planting has banked since it was set out,
      against the target you gave it. The bar fills as the heat arrives; the
      target is when it reaches the stage you care about, usually harvest.</> },
  { label: "Projected",
    info: <>The date this planting reaches its heat target if the season keeps
      its pace of the last fortnight. A projection, not a forecast.</> },
  { label: "Frost",
    info: <>Whether that date comes before the median first frost on this
      ground — and by how many days it clears it, or misses.</> },
  { label: "Status",
    info: <><b>On pace</b>: heat is arriving and a date can be projected.{" "}
      <b>Past target</b>: it has banked its heat.{" "}
      <b>Stalled</b>: too little heat lately to project a date.{" "}
      <b>Not yet out</b>: its set-out date is still ahead.{" "}
      <b>Not tracked</b>: it has no set-out date or no heat target to count from.{" "}
      <b>Perennial</b>: judged on winter chill and hardiness instead.</> },
];

export default function CropLedger({
  rows, sort, dir, onSort, editing, onEdit, onCancel, onCommit, draft, onDraft,
  saving, onDelete, harvesting, seeding,
}: {
  rows: LedgerRow[];
  sort?: ItemSort;
  dir: "asc" | "desc";
  onSort: (k: ItemSort) => void;
  /// The id of the planting open for editing, if any.
  editing: string;
  onEdit: (p: Planting) => void;
  onCancel: () => void;
  onCommit: () => void;
  draft: Planting | null;
  onDraft: (p: Planting) => void;
  saving: boolean;
  onDelete: (id: string) => void;
  harvesting?: Harvesting;
  seeding?: Seeding;
}) {
  const u = useUnits();
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <SortHeaders cols={COLS} sort={sort} dir={dir} onSort={onSort} />
        </thead>
        <tbody>
          {rows.map(({ planting: p, status: r, reason, watch, harvest }) =>
            editing === p.id && draft ? (
              <Editor key={p.id} draft={draft} onChange={onDraft} onCommit={onCommit}
                onCancel={onCancel} saving={saving} />
            ) : (
              <Fragment key={p.id}>
              <tr className={`border-b border-rule last:border-b-0 ${r ? "" : "text-ink-soft"}`}>
                <td onClick={() => onEdit(p)} className="cursor-text px-3 py-2.5 font-semibold">
                  {/* The same icon the chiclet carried, so a row and the
                      chiclet that created it read as the one crop. */}
                  <span className="mr-1.5 text-[15px]" aria-hidden="true">{SEEDLING}</span>
                  {p.crop}
                  {/* Under the name rather than in a seventh column. The table
                      already carries six, and this is a fact ABOUT the crop
                      rather than another measurement of it. */}
                  {(watch?.length ?? 0) > 0 && (
                    <span className="data mt-0.5 block text-[10.5px] font-normal text-clay">
                      {watch!.map((w) => (
                        <span key={w.model} className="mr-2 inline-block">
                          🍄 {w.label} {w.lead} {shortDate(w.date)}
                        </span>
                      ))}
                    </span>
                  )}
                  {/* A tree is described by the figures it IS judged on, a crop
                      by its target and base. With none of them, nothing: this
                      line used to say "on the record", which a grower asked the
                      meaning of — it meant only "saved", and the row's own
                      cells already say what is missing. */}
                  {(() => {
                    const facts = (p.perennial
                      ? [p.chillHours != null && `${p.chillHours} h chill`,
                         p.hardyToF != null && `hardy to ${u.showTemp(p.hardyToF)}`]
                      : [p.gddTarget != null && `target ${u.showDD(p.gddTarget)}`,
                         p.baseTempF != null && `base ${u.showTemp(p.baseTempF)}`]
                    ).filter(Boolean).join(" · ");
                    return facts
                      ? <small className="block text-[11px] font-normal text-ink-soft">{facts}</small>
                      : null;
                  })()}
                  {/* What it gave, under what it was asked to do. The heat
                      target is "usually harvest"; this is when harvest was. */}
                  {harvest && (
                    <span className="data mt-0.5 block text-[10.5px] font-normal text-growth">
                      {describeHarvest(harvest, shortDate)}
                    </span>
                  )}
                </td>
                <td onClick={() => onEdit(p)} className="cursor-text px-3 py-2.5 whitespace-nowrap">
                  {p.setOut ? shortDate(p.setOut) : "—"}
                </td>

                {r ? (
                  <>
                    <td className="px-3 py-2.5">
                      <HeatBar r={r} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.projected_date ? shortDate(r.projected_date) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Verdict r={r} />
                    </td>
                  </>
                ) : (
                  // Not tracked: one cell across the computed columns, saying
                  // what it would need rather than showing three dashes.
                  <td className="px-3 py-2.5" colSpan={3}>
                    <span className="data text-[11px]">{reason ?? "nothing to count from"}</span>
                  </td>
                )}

                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <span className={`mr-2 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold ${
                    r ? (STATUS[r.state] ?? STATUS.on_pace).cls : "bg-band text-ink-soft"
                  }`}>
                    {/* "Not tracked" is wrong for a tree: it is tracked, on a
                        different clock. */}
                    {r ? (STATUS[r.state] ?? STATUS.on_pace).label
                       : p.perennial ? "Perennial" : "Not tracked"}
                  </span>
                  {/* Full and green where there is seed on the shelf for this
                      plant, empty and quiet where there is not. The ledger is
                      read down a column, and a row that holds a packet is
                      worth knowing at a glance rather than by opening every
                      row in turn to find out. */}
                  {seeding && (() => {
                    const held = seeding.lotsFor(p).length > 0;
                    return (
                      <button onClick={() => seeding.onOpen(p)}
                        aria-label={held ? `Seed for ${p.crop} — on hand` : `Seed for ${p.crop}`}
                        title={held ? "Seed on hand" : "Seed"}
                        className={`inline-flex h-11 w-11 items-center justify-center ${
                          held ? "text-growth" : "text-ink-soft active:text-growth"}`}>
                        <Glyph path={held ? ICON.seed : ICON.seedOutline} /></button>
                    );
                  })()}
                  {harvesting && (
                    <button onClick={() => harvesting.onOpen(p)}
                      aria-label={`Record a cut of ${p.crop}`} title="Record a harvest"
                      className="inline-flex h-11 w-11 items-center justify-center text-ink-soft active:text-growth">
                      <Glyph path={ICON.shears} size={24} grid={512} /></button>
                  )}
                  <button onClick={() => onDelete(p.id)} aria-label={`Remove ${p.crop}`} title="Remove"
                    className="inline-flex h-11 w-11 items-center justify-center text-ink-soft active:text-clay"><TrashGlyph /></button>
                </td>
              </tr>
              {seeding?.open === p.id && (
                <SeedRow planting={p} lots={seeding.lotsFor(p)} saving={seeding.saving}
                  onBind={(on, lot) => seeding.onBind(p, on, lot)}
                  onSaveLot={(l) => seeding.onSaveLot(p, l)}
                  onRetireLot={seeding.onRetireLot} onCancel={seeding.onClose} />
              )}
              {harvesting?.open === p.id && (
                <HarvestRow planting={p} unit={harvesting.unitFor(p.crop)}
                  onSave={(h, id) => harvesting.onSave(p, h, id)} onCancel={harvesting.onClose} />
              )}
              </Fragment>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function HeatBar({ r }: { r: PlantingStatus }) {
  const pct = Math.round((r.progress ?? 0) * 100);
  const over = r.state === "past_target";
  return (
    <>
      <div className="relative h-[7px] min-w-[90px] overflow-hidden rounded bg-band">
        <i className={`absolute inset-y-0 left-0 rounded ${over ? "bg-honey" : "bg-growth"}`}
           style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="data mt-1 block text-[11px] text-ink-soft">
        {r.gdd_accumulated != null
          ? `${Math.round(r.gdd_accumulated).toLocaleString()} / ${r.gdd_target.toLocaleString()}`
          : r.note}
        {r.gdd_remaining ? ` · ${Math.round(r.gdd_remaining)} to go` : ""}
      </span>
    </>
  );
}

function Verdict({ r }: { r: PlantingStatus }) {
  const vd = VERDICT[r.finish.verdict] ?? VERDICT.unknown;
  return (
    <>
      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${vd.cls}`}>
        {vd.label}
      </span>
      {/* The verdict's reasoning was tooltip-only. On a tablet that is the
          same as not shipping it. */}
      {r.finish.margin_days != null && r.finish.verdict !== "finished" && (
        <span className="data mt-1 block text-[10px] text-ink-soft">
          {r.finish.margin_days >= 0
            ? `${r.finish.margin_days} days of margin`
            : `${Math.abs(r.finish.margin_days)} days late`}
        </span>
      )}
      {r.finish.at_risk_of_early_frost && r.finish.verdict === "finishes" && (
        <span className="data mt-1 block text-[10px] text-frost">
          past the earliest frost on record
        </span>
      )}
      {r.finish.verdict === "wont_finish" && r.finish.gdd_shortfall != null && (
        <span className="data mt-1 block text-[10px] text-clay">
          ~{Math.round(r.finish.gdd_shortfall)} GDD short
        </span>
      )}
    </>
  );
}

/// A cut of one planting, recorded under its row.
///
/// Under the row rather than in a dialog, so the planting it belongs to is the
/// thing directly above it. The date starts at today — most cuts are recorded
/// the day they are made, often standing in the bed.
/// One planting's seed: the day it went in, and the packet it came from.
///
/// Both are facts about THIS planting, not about the packet — two successions
/// from one packet each have their own day, which is why the date lives here
/// and not on the lot.
///
/// The packet is optional after the date, and deliberately so: garlic cloves,
/// asparagus crowns, a nursery start and a grafted tree all have a day they
/// went in and no packet at all.
function SeedRow({ planting, lots, saving, onBind, onSaveLot, onRetireLot, onCancel }: {
  planting: Planting;
  lots: SeedLot[];
  saving?: boolean;
  onBind: (sownOn: string, seedLotId: string) => Promise<string | null>;
  onSaveLot: (lot: SeedLot) => Promise<string | null>;
  onRetireLot: (lot: SeedLot) => void;
  onCancel: () => void;
}) {
  const [sown, setSown] = useState(planting.sownOn ?? "");
  const [lotId, setLotId] = useState(planting.seedLotId ?? "");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function commit() {
    if (busy) return;
    setBusy(true); setErr("");
    const why = await onBind(sown, lotId);
    setBusy(false);
    if (why) setErr(why); else onCancel();
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); void commit(); }
    if (e.key === "Escape") onCancel();
  };

  const bound = lots.find((l) => l.id === lotId);

  return (
    <tr className="border-b border-rule bg-growth/5 last:border-b-0">
      <td colSpan={6} className="px-3 py-2.5">
        {/* Pinned to the left of whatever part of the table is in view, and
            no wider than the screen — the same reason HarvestRow does it. */}
        <div className="sticky left-3 max-w-[calc(100vw-3.5rem)]">
          {/* Every control for this form in one place, at the top right of
              its span. They were scattered: a toggle in the middle of the
              fields, a save and a cancel after them, and the add button at
              the far bottom corner of a second box. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-start gap-x-3 gap-y-2.5">
              {/* No plant name here: this row hangs under the plant's own,
                  and saying it twice is what made the head look like a
                  heading rather than a form. */}
              <Field label="Sown" htmlFor={`sown-${planting.id}`} width="w-[10rem]">
                <input id={`sown-${planting.id}`} type="date" value={sown} className={FIELD}
                  onKeyDown={keys} onChange={(e) => setSown(e.target.value)} />
              </Field>
              {/* The caption is a sibling of the select, never its parent: a
                  tap inside a label can be handed to the label's own control,
                  and on an iPad that swallows the tap entirely. */}
              <Field label="Seed" htmlFor={`seed-lot-${planting.id}`} width="min-w-[14rem] flex-1">
                <select id={`seed-lot-${planting.id}`} value={lotId} className={FIELD}
                  onKeyDown={keys} onChange={(e) => setLotId(e.target.value)}>
                  <option value="">—</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {[l.variety, lotLine(l), onHand(l)].filter(Boolean).join(" · ") || l.crop}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 pt-3.5">
              <button type="button" onClick={() => setAdding((a) => !a)} disabled={adding}
                aria-label={`Add a seed lot of ${planting.crop}`} title="Add a seed lot"
                className="inline-flex h-11 w-11 items-center justify-center text-ink-soft
                  active:text-growth disabled:opacity-30">
                <Glyph path={ICON.add} />
              </button>
              <button type="button" onClick={() => { if (bound) { onRetireLot(bound); setLotId(""); } }}
                disabled={!bound} aria-label={`Remove ${bound?.crop ?? planting.crop} seed`}
                title="Remove this lot"
                className="inline-flex h-11 w-11 items-center justify-center text-ink-soft
                  active:text-clay disabled:opacity-30">
                <TrashGlyph />
              </button>
              <button type="button" onClick={onCancel} aria-label="Cancel" title="Cancel"
                className="inline-flex h-11 w-11 items-center justify-center text-ink-soft active:text-ink">
                <Glyph path={ICON.cancelEdit} />
              </button>
              {/* One affirmative, whose meaning follows the form that is open:
                  it adds the packet while the packet's fields are showing, and
                  otherwise writes the sowing and the chosen lot. */}
              <button type={adding ? "submit" : "button"} form={adding ? "new-seed" : undefined}
                onClick={adding ? undefined : () => void commit()} disabled={busy || saving}
                aria-label={adding ? "Add seed lot" : "Save seed"}
                title={adding ? "Add" : "Save"}
                className="inline-flex h-11 w-11 items-center justify-center text-[18px]
                  text-growth disabled:opacity-40">✓</button>
            </div>
          </div>

          {adding && (
            <SeedForm crop={planting.crop} taxonId={planting.taxonId}
              varieties={[...new Set(lots.map((l) => l.variety).filter(Boolean))] as string[]}
              units={[...new Set(lots.map((l) => l.unit).filter(Boolean))] as string[]}
              onSave={async (l) => {
                const why = await onSaveLot(l);
                if (why) return why;
                // Bound and written in the same gesture. A packet added from a
                // plant's own row is the packet that plant was sown from, so
                // asking the grower to pick it from a list and then press save
                // again would be asking twice for something already said.
                setLotId(l.id);
                setAdding(false);
                const failed = await onBind(sown, l.id);
                if (failed) setErr(failed); else onCancel();
                return null;
              }} />
          )}
          {err && <p className="mt-1.5 text-[12px] text-clay">{err}</p>}
        </div>
      </td>
    </tr>
  );
}

function HarvestRow({ planting, unit, onSave, onCancel }: {
  planting: Planting;
  unit?: string;
  onSave: (h: HarvestInput, id: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [on, setOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [unitText, setUnitText] = useState(unit ?? "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  // One id for as long as this form is open: a second tap after a save that
  // landed without answering updates this cut instead of adding another.
  const [id] = useState(() => newItemId("hv"));

  async function commit() {
    if (saving) return;
    setSaving(true); setErr("");
    const n = amount.trim() === "" ? undefined : Number(amount);
    const why = await onSave({ on, amount: n, unit: unitText, note }, id);
    setSaving(false);
    if (why) setErr(why);
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); void commit(); }
    if (e.key === "Escape") onCancel();
  };

  return (
    <tr className="border-b border-rule bg-growth/5 last:border-b-0">
      <td colSpan={6} className="px-3 py-2">
        {/* Pinned to the left of whatever part of the table is in view, and
            no wider than the screen. On a phone the ledger scrolls sideways;
            without this the form opened half off-screen, its save button out
            of reach and the crop's name scrolled away. */}
        <div className="sticky left-3 max-w-[calc(100vw-3.5rem)]">
          {/* Same shape as the seed row: every caption above its control, all
              of them one height, and the two buttons together at the top
              right. The date wore no caption at all while "How much" wore
              one, which is why nothing in this row lined up. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-start gap-x-3 gap-y-2.5">
              {/* The plant's name stays here, unlike the seed row's: a cut can
                  be open while the reader has scrolled sideways, and this is
                  the only thing saying which plant the amount belongs to. */}
              <span className="flex items-center gap-1.5 pt-3.5 text-[12.5px] font-semibold">
                <Glyph path={ICON.shears} size={20} grid={512} />A cut of {planting.crop}
              </span>
              <Field label="Cut on" htmlFor={`cut-on-${planting.id}`} width="w-[10rem]">
                <input id={`cut-on-${planting.id}`} type="date" value={on} max={today}
                  className={FIELD} onKeyDown={keys}
                  onChange={(e) => setOn(e.target.value)} />
              </Field>
              <QuantityField id={`cut-${planting.id}`} label="How much" width="w-[11rem]"
                amount={amount} unit={unitText} units={UNITS} placeholder="12"
                unitPlaceholder="stems"
                onAmount={setAmount} onUnit={setUnitText} onKeyDown={keys} />
              <Field label="Note" htmlFor={`cut-note-${planting.id}`} width="min-w-[10rem] flex-1">
                <input id={`cut-note-${planting.id}`} value={note} className={FIELD}
                  onKeyDown={keys} placeholder="optional"
                  onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <span className="flex shrink-0 items-center gap-0.5 pt-3.5">
              <RowActions onCommit={() => void commit()} onCancel={onCancel} saving={saving} what="harvest" />
            </span>
          </div>
          {err && <p className="mt-1.5 text-[12px] text-clay">{err}</p>}
        </div>
      </td>
    </tr>
  );
}

/// One planting, open for editing.
///
/// In the row rather than in a form above the table, so the thing being changed
/// stays where it was read. Until this existed, fixing a mistyped heat target
/// meant deleting the planting and typing it again.
function Editor({ draft, onChange, onCommit, onCancel, saving }: {
  draft: Planting;
  onChange: (p: Planting) => void;
  onCommit: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const u = useUnits();
  const set = (patch: Partial<Planting>) => onChange({ ...draft, ...patch });
  // Enter saves and Escape abandons: a row editor that can only be dismissed
  // with the mouse is slower than the form it replaced.
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onCommit(); }
    if (e.key === "Escape") onCancel();
  };
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  // Shown in the reader's scale, held in Fahrenheit. A base temperature is a
  // POINT on the scale and a GDD target is an INTERVAL along it, so they
  // convert differently — see lib/units.ts.
  const baseToF = (v: string) => { const n = num(v); return n == null ? undefined : u.toF(n); };
  const gddToF = (v: string) => {
    const n = num(v);
    return n == null ? undefined : (u.unit === "C" ? n * (9 / 5) : n);
  };
  const base = draft.baseTempF == null ? "" : String(Math.round(u.temp(draft.baseTempF)));
  const target = draft.gddTarget == null ? "" : String(Math.round(u.degreeDays(draft.gddTarget)));

  return (
    <tr className="border-b border-rule bg-band/40 last:border-b-0">
      <td className="px-3 py-2 align-top">
        <input autoFocus value={draft.crop} className={CELL} onKeyDown={keys}
          placeholder="Zinnia · succession 4"
          onChange={(e) => set({ crop: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input type="date" value={draft.setOut ?? ""} className={CELL} onKeyDown={keys}
          onChange={(e) => set({ setOut: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top" colSpan={2}>
        <input inputMode="numeric" defaultValue={target} className={CELL}
          onKeyDown={keys} placeholder={`${u.ddUnit.trim()} target — leave blank for a perennial`}
          onChange={(e) => set({ gddTarget: gddToF(e.target.value) })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input type="number" inputMode="decimal" step="1" defaultValue={base} className={CELL}
          min={baseBounds(u).min} max={baseBounds(u).max}
          onKeyDown={keys} placeholder={`base${u.tempUnit}`}
          onChange={(e) => set({ baseTempF: baseToF(e.target.value) })} />
      </td>
      <td className="px-2 py-2 text-right align-top whitespace-nowrap">
        <RowActions onCommit={onCommit} onCancel={onCancel} saving={saving} what="planting" />
      </td>
    </tr>
  );
}
