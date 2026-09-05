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

import { useUnits } from "./Units";
import type { PlantingStatus } from "../lib/mcp";
import { SEEDLING, type Planting } from "../lib/plantings";
import { SortHeaders, type Column } from "./RecordTable";
import { CELL, RowActions } from "./ui";
import type { ItemSort } from "../lib/blockItems";

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
}

const COLS: Column<ItemSort>[] = [
  { key: "name", label: "Crop" },
  { key: "starts_on", label: "Set out" },
  { key: "target_gdd", label: "Heat to target", width: "34%" },
  { label: "Projected" },
  { label: "Frost" },
  { label: "" },
];

export default function CropLedger({
  rows, sort, dir, onSort, editing, onEdit, onCancel, onCommit, draft, onDraft,
  saving, onDelete,
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
}) {
  const u = useUnits();
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <SortHeaders cols={COLS} sort={sort} dir={dir} onSort={onSort} />
        </thead>
        <tbody>
          {rows.map(({ planting: p, status: r, reason }) =>
            editing === p.id && draft ? (
              <Editor key={p.id} draft={draft} onChange={onDraft} onCommit={onCommit}
                onCancel={onCancel} saving={saving} />
            ) : (
              <tr key={p.id} className={`border-b border-rule last:border-b-0 ${r ? "" : "text-ink-soft"}`}>
                <td onClick={() => onEdit(p)} className="cursor-text px-3 py-2.5 font-semibold">
                  {/* The same icon the chiclet carried, so a row and the
                      chiclet that created it read as the one crop. */}
                  <span className="mr-1.5 text-[15px]" aria-hidden="true">{SEEDLING}</span>
                  {p.crop}
                  <small className="block text-[11px] font-normal text-ink-soft">
                    {/* A tree is described by the figures it IS judged on.
                        "on the record · base 50 °F" under an apple stated one
                        thing that was vague and one that was not true. */}
                    {p.perennial
                      ? [p.chillHours != null && `${p.chillHours} h chill`,
                         p.hardyToF != null && `hardy to ${u.showTemp(p.hardyToF)}`]
                          .filter(Boolean).join(" · ") || "on the record"
                      : <>
                          {p.gddTarget != null
                            ? `target ${u.showDD(p.gddTarget)}`
                            : "on the record"}
                          {p.baseTempF != null && ` · base ${u.showTemp(p.baseTempF)}`}
                        </>}
                  </small>
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
                  <button onClick={() => onDelete(p.id)} aria-label={`Remove ${p.crop}`}
                    className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                </td>
              </tr>
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
        <input inputMode="numeric" defaultValue={base} className={CELL}
          onKeyDown={keys} placeholder={`base${u.tempUnit}`}
          onChange={(e) => set({ baseTempF: baseToF(e.target.value) })} />
      </td>
      <td className="px-2 py-2 text-right align-top whitespace-nowrap">
        <RowActions onCommit={onCommit} onCancel={onCancel} saving={saving} what="planting" />
      </td>
    </tr>
  );
}
