// Crops — the block's plantings and where each one stands.
//
// The ledger is one priced call for the whole block, so adding a ninth
// planting costs arithmetic rather than another round trip. The form validates
// the way the server does, so a grower is corrected here rather than by a
// failed paid call.

import { useCallback, useEffect, useState } from "react";
import CropLedger, { type LedgerRow } from "../components/CropLedger";
import Term from "../components/Term";
import { useUnits } from "../components/Units";
import Provenance from "../components/Provenance";
import { Pager } from "../components/RecordTable";
import SearchBox from "../components/SearchBox";
import QuoteScroller from "../components/QuoteScroller";
import { cropGddStatus, cropSuitability, plantingWindow, treeSuitability,
  type CropLedgerResult, type PlantingWindowResult, type SuitabilityResult,
  type TreeAssessment, type TreeSuitabilityResult, type Verdict } from "../lib/mcp";
import {
  ANNUALS, CROP_CATEGORIES, CROP_PRESETS, makePlanting, PERENNIALS, plantingCodec,
  type CropPreset, type Planting, plantingDateFor } from "../lib/plantings";
import { useBlockItems, type ItemSort } from "../lib/blockItems";
import type { SavedRegion } from "../lib/regions";
import { Empty, ErrorBox, FIELD, ICON, IconButton, Note, Pill, Section } from "../components/ui";

const short = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/// One glyph vocabulary, two questions.
///
/// An annual is marked on whether it FINISHES; a perennial on whether it
/// SURVIVES. Sharing the glyphs and the tones is deliberate — ✓ means "this is
/// fine here" on both halves of the library, and a reader should not have to
/// learn two alphabets to scan one grid.
const MARK_CROP = {
  comfortable: { glyph: "✓", ink: "text-growth", tone: "border-growth/50 bg-growth/8" },
  tight:       { glyph: "⚠", ink: "text-honey",  tone: "border-honey/50 bg-honey/8" },
  marginal:    { glyph: "⚠", ink: "text-honey",  tone: "border-honey/60 bg-honey/12" },
  too_short:   { glyph: "✕", ink: "text-clay",   tone: "border-clay/40 bg-clay/8 opacity-60" },
  unknown:     null,
} as const;

const MARK_TREE = {
  hardy:    { glyph: "✓", ink: "text-growth", tone: "border-growth/50 bg-growth/8" },
  marginal: { glyph: "⚠", ink: "text-honey",  tone: "border-honey/50 bg-honey/8" },
  risky:    { glyph: "⚠", ink: "text-honey",  tone: "border-honey/60 bg-honey/12" },
  too_cold: { glyph: "✕", ink: "text-clay",   tone: "border-clay/40 bg-clay/8 opacity-60" },
  unrated:  null,
  unknown:  null,
} as const;

export default function Crops({
  region, onCost,
}: {
  region: SavedRegion;
  onCost: (sats: number) => void;
}) {
  const u = useUnits();
  // The grower's record, read from the server under their npub — not from
  // this browser. What they saved on the laptop is what the phone shows.
  // Order, search and paging are the database's — it sorts every planting on
  // the block, not the twenty in hand. Search runs on submit, never per
  // keystroke: a read costs sats.
  const [sort, setSort] = useState<ItemSort>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [pageNo, setPageNo] = useState(0);
  const [search, setSearch] = useState("");

  const { items: plantings, save: storePlanting, retire: retirePlanting,
          loading: plantingsLoading, error: plantingsError,
          unknownBlock: plantingsUnknown, total, page, pages } =
    useBlockItems<Planting>(region.id, "planting", plantingCodec, undefined, {
      sortCol: sort, sortDir: dir, page: pageNo, search, pageSize: 20,
    });

  function sortBy(col: ItemSort) {
    if (col === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(col); setDir("asc"); }
    setPageNo(0);
  }

  /// The planting open for editing, and the draft being typed into it.
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState<Planting | null>(null);
  const [savingRow, setSavingRow] = useState(false);

  async function commitRow() {
    if (!draft) return;
    if (!draft.crop.trim()) { setFormErr("A planting needs a crop."); return; }
    setSavingRow(true); setFormErr("");
    try {
      await storePlanting(draft);
      setEditing(""); setDraft(null);
    } catch (e) {
      setFormErr(String((e as Error).message ?? e));
    } finally { setSavingRow(false); }
  }
  const [ledger, setLedger] = useState<CropLedgerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [formErr, setFormErr] = useState("");
  /// What the last row-click put on the ledger, so a tap is not silent.
  const [added, setAdded] = useState("");
  const [fit, setFit] = useState<SuitabilityResult | null>(null);
  const [fitAt, setFitAt] = useState<Date | null>(null);
  const [fitBusy, setFitBusy] = useState(false);
  const [treeFit, setTreeFit] = useState<TreeSuitabilityResult | null>(null);
  const [treeAt, setTreeAt] = useState<Date | null>(null);
  const [treeBusy, setTreeBusy] = useState(false);
  const [cat, setCat] = useState<CropPreset["category"] | "all">("all");
  const [when, setWhen] = useState<PlantingWindowResult | null>(null);
  const [whenAt, setWhenAt] = useState<Date | null>(null);
  const [whenBusy, setWhenBusy] = useState(false);


  const run = useCallback(async (list: Planting[]) => {
    if (!list.length) { setLedger(null); return; }
    setBusy(true); setError("");
    try {
      const r = await cropGddStatus(
        region.id,
        list.map((p) => ({
          // Which saved planting this is. Two successions of one crop are two
          // choices the grower made, and nothing else on the row tells them
          // apart — they share a name, a target and often a base temperature.
          ref: p.id,
          crop: p.crop,
          // Omitted rather than defaulted: the server reads a missing target
          // or set-out as a presence row and reports it as untracked, where a
          // fabricated value would be rejected and cost the whole ledger.
          ...(p.gddTarget != null ? { gdd_target: p.gddTarget } : {}),
          ...(p.setOut ? { set_out: p.setOut } : {}),
          ...(p.baseTempF != null ? { base_temp: p.baseTempF } : {}),
          // Sent so the ledger can say "perennial" rather than listing the
          // fields an annual would have had.
          ...(p.perennial ? { perennial: true } : {}),
          ...(p.chillHours != null ? { chill_hours: p.chillHours } : {}),
          ...(p.hardyToF != null ? { hardy_to_f: p.hardyToF } : {}),
        })),
        region.baseTempF,
      );
      if (!r.success) { setError(r.error || "The ledger could not be read."); return; }
      setLedger(r); setRanAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(plantings); }, [run, plantings]);

  // "What can I grow here" is not a lookup — it is this block's own frost-free
  // heat budget against each crop's need. One call rates the whole library.
  const checkFit = useCallback(async () => {
    setFitBusy(true); setError("");
    try {
      const r = await cropSuitability(
        region.id,
        // Annuals only. "Does it finish before frost" is a question a tree is
        // not asked, and sending one would mean inventing the heat target it
        // deliberately does not have. Trees are rated by `treeSuitability`.
        ANNUALS.map((c) => ({
          crop: c.crop, gdd_target: c.gddTarget!, base_temp: c.baseTempF!,
          frost_hardy: c.frostHardy ?? false, category: c.category, emoji: c.emoji,
        })),
      );
      if (!r.success) { setError(r.error || "Suitability could not be read."); return; }
      setFit(r); setFitAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setFitBusy(false); }
  }, [region]);

  /// Add straight from a chiclet. The set-out defaults to today, which is
  /// right far more often than an empty field is — a grower tapping a crop is
  /// usually putting it in now.
  /// Add straight from a sowing row. See plantingDateFor for the date rule.
  function addFromWindow(row: { crop: string; earliest_out?: string | null }) {
    const c = CROP_PRESETS.find((x) => x.crop === row.crop);
    if (!c) return;
    const on = plantingDateFor(row.earliest_out, new Date().toISOString().slice(0, 10));
    const made = makePlanting(c.crop, c.gddTarget, on, region.id, c.baseTempF);
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    void storePlanting(made).catch((e) => setFormErr(String(e.message ?? e)));
    setAdded(`${c.emoji} ${c.crop} — on the ledger, dated ${short(on)}.`);
  }

  function addPreset(c: CropPreset) {
    // A perennial goes on the record undated. "Planted today" is right for a
    // tray of zinnias and usually wrong for a tree, which was here before this
    // page was — and a fabricated set-out would propagate into every answer.
    const made = makePlanting(
      c.crop,
      c.gddTarget,
      c.perennial ? "" : new Date().toISOString().slice(0, 10),
      region.id,
      c.baseTempF,
      c.perennial
        ? { perennial: true, chillHours: c.chillHours, hardyToF: c.hardyToF }
        : undefined,
    );
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    void storePlanting(made).catch((e) => setFormErr(String(e.message ?? e)));
  }

  // "How much heat does it need" and "when does it go in" are different
  // questions. This is the second one, from the block's own frost and soil.
  const checkWhen = useCallback(async () => {
    setWhenBusy(true); setError("");
    try {
      const r = await plantingWindow(
        region.id,
        ANNUALS.map((c) => ({
          crop: c.crop, gdd_target: c.gddTarget!, base_temp: c.baseTempF!,
          frost_hardy: c.frostHardy ?? false, direct_sow: c.directSow ?? false,
          emoji: c.emoji,
          ...(c.minSoilF != null ? { min_soil_f: c.minSoilF } : {}),
          ...(c.startIndoorsWeeks != null ? { start_indoors_weeks: c.startIndoorsWeeks } : {}),
        })),
      );
      if (!r.success) { setError(r.error || "The planting window could not be read."); return; }
      setWhen(r); setWhenAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setWhenBusy(false); }
  }, [region]);

  const verdictOf = (crop: string): Verdict | null =>
    fit?.crops.find((r) => r.crop === crop)?.verdict ?? null;

  const treeOf = (crop: string): TreeAssessment | null =>
    treeFit?.trees.find((r) => r.tree === crop) ?? null;

  // "Will it live here?" — the perennial half of "what can I grow". One call
  // rates the whole tree library against every winter on record.
  const checkTrees = useCallback(async () => {
    setTreeBusy(true); setError("");
    try {
      const r = await treeSuitability(
        region.id,
        PERENNIALS.map((c) => ({
          tree: c.crop, category: c.category, emoji: c.emoji,
          ...(c.chillHours != null ? { chill_hours: c.chillHours } : {}),
          ...(c.hardyToF != null ? { hardy_to_f: c.hardyToF } : {}),
        })),
      );
      if (!r.success) { setError(r.error || "The tree record could not be read."); return; }
      setTreeFit(r); setTreeAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setTreeBusy(false); }
  }, [region]);


  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Typed in the scale on screen, held in the Fahrenheit the record keeps.
    const base = f.get("base") ? u.toF(Number(f.get("base"))) : undefined;
    const target = String(f.get("target") ?? "").trim();
    const made = makePlanting(
      String(f.get("crop") ?? ""),
      target ? u.ddToF(Number(target)) : undefined,
      String(f.get("setout") ?? ""), region.id, base,
      // Blank on both counts is how a perennial is entered by hand: it is on
      // the record, and it is not being paced.
      target ? undefined : { perennial: true },
    );
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    void storePlanting(made).catch((err) => setFormErr(String(err.message ?? err)));
    e.currentTarget.reset();
  }

  /// The record, decorated by whatever the season had to say about it.
  ///
  /// Joined on `ref` — the saved item's own id, echoed back untouched. It used
  /// to be joined on the crop NAME, which meant two successions of one crop
  /// were the same row to this code. They are two choices the grower made.
  const ledgerRows: LedgerRow[] = plantings.map((planting) => {
    const status = ledger?.plantings?.find(
      (r) => (r.ref && r.ref === planting.id) || (!r.ref && r.crop === planting.crop),
    );
    const missed = ledger?.untracked?.find(
      (u) => (u.ref && u.ref === planting.id) || (!u.ref && u.crop === planting.crop),
    );
    return { planting, status, reason: missed?.reason };
  });

  const remove = (id: string) =>
    void retirePlanting(id).catch((e) => setFormErr(String(e.message ?? e)));

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-1.5">
        {/* Submits the form below by id, so the act has one compact control
            instead of a sentence at the foot of a form. */}
        <IconButton path={ICON.add} label="Planting" form="new-planting"
          title="Add a planting" />
      </div>

      {error && (
        <ErrorBox>{error}</ErrorBox>
      )}

      {/* ── Add a planting ─────────────────────────────────────────────── */}
      <form id="new-planting" onSubmit={add} className="mb-4 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft">
            Crop
            <input name="crop" list="ge-crop-presets" placeholder="Zinnia · succession 4"
              className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            GDD target <span className="opacity-60">(optional)</span>
            <input name="target" inputMode="numeric" placeholder="780" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Planted <span className="opacity-60">(set out or sown)</span>
            <input name="setout" type="date" className={FIELD} />
          </label>
          {/* The explanation used to be a sixty-word paragraph under the
              form. It is a definition, not a control, so it moved behind the
              word it defines — the page shows the field and says what it is
              only when asked. */}
          <label className="block text-[11px] text-ink-soft">
            <Term label={`Base${u.tempUnit}`}>The temperature below which this
              plant does no growing — its own threshold, not the field&rsquo;s.
              Heat is counted as the degrees each day spends above it. Winter
              wheat counts from 32&nbsp;°F and field corn from 50&nbsp;°F on the
              same acre, which is why it sits on the planting rather than on the
              block. Blank takes {region.name}&rsquo;s{" "}
              {u.showTemp(region.baseTempF)}.</Term>{" "}
            <span className="opacity-60">(optional)</span>
            <input name="base" inputMode="numeric"
              placeholder={String(Math.round(u.temp(region.baseTempF)))}
              className={FIELD} />
          </label>
        </div>
        <datalist id="ge-crop-presets">
          {CROP_PRESETS.map((c) => <option key={c.crop} value={c.crop} />)}
        </datalist>
        {formErr && <p className="mt-2 text-[12px] text-clay">{formErr}</p>}
      </form>

      <Section emoji="📒" title="Crop ledger" first>
        {plantings.length > 0 && (
          <Provenance tool="goodearth_crop_gdd_status" at={ranAt} onCost={onCost} />
        )}
      </Section>

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <SearchBox value={search} placeholder="regex ok, e.g. zinnia|dahlia"
          onSearch={(t) => { setSearch(t); setPageNo(0); }} />
      </div>

      {/* The server's summary counts the rows it was SENT, which is now one
          page. Quoting it over a paged table would say "3 plantings" of a
          block holding twenty. The pager states the true count; what only the
          ledger knows is the frost date, so that is what is kept. */}
      {ledger?.first_frost && (
        <p className="mb-2.5 text-[13px] text-ink-soft">
          Median first frost {new Date(ledger.first_frost.median + "T12:00:00")
            .toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
          {ledger.wont_finish?.length ? ` ${ledger.wont_finish.length} on this page will not make it.` : ""}
        </p>
      )}

      {busy && !ledger ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller heading="Reading the ledger" />
        </div>
      ) : ledger ? (
        <>
          <CropLedger
            rows={ledgerRows} sort={sort} dir={dir} onSort={sortBy}
            editing={editing} draft={draft} saving={savingRow}
            onEdit={(pl) => { setEditing(pl.id); setDraft(pl); }}
            onDraft={setDraft}
            onCancel={() => { setEditing(""); setDraft(null); }}
            onCommit={commitRow}
            onDelete={remove}
          />
          <Pager page={page} pages={pages} total={total} noun="planting"
            onPage={setPageNo} />
        </>
      ) : plantingsLoading ? (
        <Empty>Reading what you have on {region.name}…</Empty>
      ) : plantingsUnknown ? (
        <ErrorBox>This browser is set to ground the record does not have. Pick the block again from Favorites, or save it on the Map.</ErrorBox>
      ) : plantingsError ? (
        // The record is the truth here, so a failure to read it must say so.
        // Showing an empty page would claim this ground grows nothing.
        <ErrorBox>Could not read your record for {region.name}: {plantingsError}</ErrorBox>
      ) : (
        <Empty>
          {search
            ? "Nothing matches that. Clear the search to see everything you grow."
            : `No plantings on ${region.name} yet. Add one above and the ledger will `
              + "tell you where it stands and whether it finishes before frost."}
        </Empty>
      )}

      {/* ── Grows here ─────────────────────────────────────────────── */}
      <Section emoji="🌾" title="Grows here">
        {!fit && (
          <Pill onClick={checkFit} disabled={fitBusy} active>
            {fitBusy ? "🧠 Reading…" : "🧠 What?"}
          </Pill>
        )}
        {/* The perennial half of the same question, and a separate call
            because it is a separate one: an annual is rated on whether it
            finishes before frost, a tree on whether it lives through the
            winter. Asked on its own so a grower with no trees never pays for
            an answer about them. */}
        {!treeFit && (
          <Pill onClick={checkTrees} disabled={treeBusy}>
            {treeBusy ? "🌳 Reading…" : "🌳 Trees?"}
          </Pill>
        )}
        {fit && <Provenance tool="goodearth_crop_suitability" at={fitAt} onCost={onCost} />}
        {treeFit && <Provenance tool="goodearth_tree_suitability" at={treeAt} onCost={onCost} />}
      </Section>

      {treeFit && (
        <div className="mb-3 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
          <p className="text-[13px]">{treeFit.summary}</p>
          {treeFit.chill && (
            <p className="data mt-1 text-[11.5px] text-ink-soft">
              {treeFit.chill.median_hours} h median chill · lowest{" "}
              {treeFit.chill.lowest_hours} h · {treeFit.chill.winters_on_record} winters ·{" "}
              {treeFit.chill.window}
            </p>
          )}
        </div>
      )}

      {fit ? (
        <div className="mb-3 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
          <p className="text-[13px]">
            <b className="figure text-[16px]">{fit.budget.frost_free_days} frost-free days</b>
            {fit.budget.gdd_by_base["50"] != null && (
              <> · about <b>{Math.round(fit.budget.gdd_by_base["50"]).toLocaleString()} GDD₅₀</b> inside them</>
            )}
            , median over {fit.budget.seasons_on_record} seasons.
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft">{fit.summary}</p>
        </div>
      ) : (
        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
          Two farms in the same county — one on a bench, one in a hollow — do not
          grow the same things. Measuring your ground gives its own frost-free
          window and the heat inside it, then rates every crop below against it.
        </p>
      )}

      {/* ── The library ────────────────────────────────────────────────
          This IS the answer to "what grows here": every chiclet's colour and
          its ✓/⚠/✕ come from `fit` and nothing else, and the legend below is
          gated on it. It used to sit under the sowing table, which left the
          summary above — "34 finish comfortably, 1 tight, 2 will not" — with
          no referent, and put its own answer two screens away behind a table
          about a different question. The category filter travels with it and
          still governs the sowing table below. */}
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {([{ key: "all", label: "All" }, ...CROP_CATEGORIES] as const).map((c) => (
          <button key={c.key} onClick={() => setCat(c.key as typeof cat)}
            className={`min-h-11 rounded-full border px-3.5 text-[12.5px] font-medium ${
              cat === c.key ? "border-ink bg-ink text-paper" : "border-rule active:bg-band"}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CROP_PRESETS.filter((c) => cat === "all" || c.category === cat).map((c) => {
          // Two libraries in one grid. An annual is marked by whether it
          // finishes before frost; a perennial by whether it survives the
          // winter here — different question, different call, same chiclet.
          const t = c.perennial ? treeOf(c.crop) : null;
          const v = c.perennial ? null : verdictOf(c.crop);
          const mark =
            c.perennial
              ? t && MARK_TREE[t.hardiness.verdict]
              : v && MARK_CROP[v];
          const tone = mark?.tone ?? "border-rule bg-panel";
          const row = fit?.crops.find((r) => r.crop === c.crop);
          const w = when?.crops.find((r) => r.crop === c.crop);
          // The figure a chiclet carries is the number that decides it: heat
          // for an annual, the chill it wants for a tree.
          const figure = c.perennial
            ? (c.chillHours != null ? `${c.chillHours} h` : "")
            : String(Math.round(u.degreeDays(c.gddTarget ?? 0)));
          return (
            <button key={c.crop} onClick={() => addPreset(c)}
              title={[
                c.perennial ? t?.hardiness.note : row?.note,
                c.perennial ? t?.chill.note : undefined,
                w && `Seed ${w.start_seed_indoors ? short(w.start_seed_indoors) : "direct"} · out ${w.earliest_out ? short(w.earliest_out) : "—"}`,
                c.perennial
                  ? [c.note, c.chillHours != null && `${c.chillHours} chill hours`,
                     c.hardyToF != null && `hardy to ${u.showTemp(c.hardyToF)}`]
                      .filter(Boolean).join(", ")
                  : `${u.showDD(c.gddTarget ?? 0)} ${c.note}, base ${u.showTemp(c.baseTempF ?? region.baseTempF)}`,
              ].filter(Boolean).join(" — ")}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] active:border-ink ${tone}`}>
              <span>{c.emoji}</span>
              <span className="font-medium">{c.crop}</span>
              {figure && <span className="data text-[10.5px] text-ink-soft">{figure}</span>}
              {mark && <span className={`text-[11px] ${mark.ink}`}>{mark.glyph}</span>}
              {w?.sow_now && (
                <span className="rounded-full bg-growth/15 px-1.5 text-[10px] font-semibold text-growth">now</span>
              )}
            </button>
          );
        })}
      </div>

      {fit && (
        <p className="data mt-2 text-[10.5px] text-ink-soft">
          <span className="text-growth">✓ finishes comfortably</span>{" · "}
          <span className="text-honey">⚠ tight — a cool year could take it</span>{" · "}
          <span className="text-clay">✕ will not finish outdoors here</span>
        </p>
      )}

      <Note>Tap to add, dated today. Starting figures — edit against your own
            seed packet.</Note>

      {/* ── Sowing ─────────────────────────────────────────────────── */}
      <Section emoji="🌱" title="Sowing">
        {!when && (
          <Pill onClick={checkWhen} disabled={whenBusy} active>
            {whenBusy ? "🧠 Reading…" : "🧠 When?"}
          </Pill>
        )}
        {when && <Provenance tool="goodearth_planting_window" at={whenAt} onCost={onCost} />}
      </Section>

      {when ? (
        <>
          <div className="mb-2.5 rounded-md border border-rule border-l-4 border-l-frost bg-panel px-4 py-3">
            <p className="text-[13px]">
              Last spring frost <b>{when.frost.last_spring_median && short(when.frost.last_spring_median)}</b>
              {" · "}first fall frost <b>{when.frost.first_fall_median && short(when.frost.first_fall_median)}</b>
              {" — medians over "}{when.frost.seasons_on_record} seasons.
            </p>
            {Object.keys(when.soil_warming).length > 0 && (
              <p className="mt-1 text-[12.5px] text-ink-soft">
                Soil reaches{" "}
                {Object.entries(when.soil_warming)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([t, d]) => `${u.showTemp(Number(t))} on ${short(d)}`)
                  .join(" · ")}
              </p>
            )}
            {when.sow_now.length > 0 && (
              <p className="mt-1.5 text-[13px]">
                <b>In the window now:</b> {when.sow_now.join(", ")}
              </p>
            )}
          </div>
          <div className="mb-3 overflow-x-auto rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-[13px]">
              <thead><tr>
                {["Crop", "Seed indoors", "Out", "Last sowing", "Window"].map((h) => (
                  <th key={h} className="data border-b-[1.5px] border-ink px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[.1em] text-ink-soft">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {when.crops.filter((r) => cat === "all" ||
                  CROP_PRESETS.find((c) => c.crop === r.crop)?.category === cat).map((r) => (
                  <tr key={r.crop}
                    onClick={() => addFromWindow(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addFromWindow(r); }
                    }}
                    tabIndex={0}
                    role="button"
                    title={`Add ${r.crop} to the ledger`}
                    className={`cursor-pointer border-b border-rule last:border-b-0 hover:bg-band/60 focus:bg-band/60 focus:outline-none ${
                      r.state === "will_not_fit" ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{r.emoji} {r.crop}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.start_seed_indoors ? short(r.start_seed_indoors) : <span className="text-ink-soft">direct sow</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.earliest_out ? short(r.earliest_out) : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.latest_out ? short(r.latest_out) : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.state === "will_not_fit"
                        ? <span className="rounded-full bg-clay/15 px-2 py-0.5 text-[11px] font-semibold text-clay">won't fit</span>
                        : r.state === "narrow"
                          ? <span className="rounded-full bg-honey/15 px-2 py-0.5 text-[11px] font-semibold text-honey">{r.window_days}d — narrow</span>
                          : <span className="text-ink-soft">{r.window_days}d</span>}
                      {r.sow_now && <span className="ml-1.5 rounded-full bg-growth/15 px-2 py-0.5 text-[11px] font-semibold text-growth">now</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-2 text-[12px] text-ink-soft">
            {added || "Tap a row to put that crop on the ledger at its own out date."}
          </p>
          <p className="mb-4 text-[12px] leading-relaxed text-ink-soft">
            A tender crop's "out" date is the <b>median</b> last frost — half of
            seasons frost later than that, so it is a coin toss rather than a
            green light. The last-sowing date uses the season's average heat
            rate, so it flatters the very end of the window: heat comes slower
            in September than in July.
          </p>
        </>
      ) : (
        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
          Heat requirement says whether a crop <i>can</i> finish here. It says
          nothing about when to start — which is the decision you make with a
          seed packet in hand in February. Dating your ground gives three:
          when seed goes in under lights, when the plant can go out, and the
          last day a sowing still beats the frost.
        </p>
      )}

    </>
  );
}
