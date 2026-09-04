// Pests — where each pest a grower watches for stands on this ground.
//
// The answer a grower acts on is not the whole table, it is what to watch
// for now — so that leads, and the detail follows.
//
// The catalogue below is USA-NPN's, read live for this region. It replaced a
// list of five pests written in this repo, which was one author's guess at
// what a farm cares about, the same for a Vermont lakeshore and a Georgia
// orchard.

import { useCallback, useEffect, useState } from "react";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import { Pager, SortHeaders, type Column } from "../components/RecordTable";
import SearchBox from "../components/SearchBox";
import UndoBar, { remembered } from "../components/UndoBar";
import Term from "../components/Term";
import { useUnits } from "../components/Units";
import {
  CELL, Chiclet, Empty, ErrorBox, FIELD, ICON, IconButton, Note, PageTitle, Pill,
  RowActions, Section, StatusChip,
} from "../components/ui";
import { useBlockItems, type ItemSort } from "../lib/blockItems";
import { pestCatalog, pestThreshold, type PestCatalogResult, type PestWindowResult } from "../lib/mcp";
import {
  makePest, pestCodec, type SavedPest,
} from "../lib/pestModels";
import type { SavedRegion } from "../lib/regions";

const d = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/// Sort keys mirror the server's whitelist. The accumulation and the stage
/// chips are computed for the page in hand, not held in the record, so they
/// are not offered as columns to order by — a header that quietly does
/// nothing is worse than one that is plainly inert.
///
/// Three of these four headings are terms of art, and a grower should not have
/// to already know them to read the row underneath. The definition sits behind
/// a ⓘ rather than on the page.
function columns(ddLabel: string): Column<ItemSort>[] {
  return [
    { key: "name", label: "Pest" },
    {
      key: "starts_on", label: "Biofix",
      info: <>The day the count starts for this pest — usually the first
        sustained trap catch, sometimes just the first of January. Everything
        in the row is measured from it.</>,
    },
    {
      label: ddLabel,
      info: <>Growing degree days banked since the biofix: each day contributes
        the degrees its mean temperature ran above this pest&rsquo;s base. It is
        a running total, not a stage.</>,
    },
    {
      label: "Stages", width: "44%",
      info: <>Your thresholds. A stage is a life-cycle event — first flight,
        egg hatch — paired with the degree-day total it arrives at. Filled when
        it has been reached, otherwise showing the date it is due.</>,
    },
    { label: "" },
  ];
}

export default function Pests({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  // Degrees are read in whatever scale this browser is set to. The record
  // stays Fahrenheit — a base of 50 °F is still 50 °F, shown as 10 °C.
  const u = useUnits();
  // Order, search and paging belong to the database — it sorts every pest on
  // the block, not the twenty in hand. Search runs on submit: a read costs sats.
  const [sort, setSort] = useState<ItemSort>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [pageNo, setPageNo] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState<SavedPest | null>(null);
  const [savingRow, setSavingRow] = useState(false);

  // Read from the grower's record under their npub, not from this browser.
  const { items: models, save: storePest, retire: retirePest, reload: reloadPests,
          loading: modelsLoading, error: modelsError,
          unknownBlock: modelsUnknown, total, page, pages } =
    useBlockItems<SavedPest>(region.id, "pest", pestCodec, undefined, {
      sortCol: sort, sortDir: dir, page: pageNo, search, pageSize: 20,
    });
  const [data, setData] = useState<PestWindowResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [formErr, setFormErr] = useState("");
  const [cat, setCat] = useState<PestCatalogResult | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [catAt, setCatAt] = useState<Date | null>(null);
  /// Tapping a catalogue entry names the pest and leaves the numbers blank.
  /// The species is a fact about this country; the threshold is the grower's.
  const [pestName, setPestName] = useState("");

  /// Naming a pest from the catalogue below fills the form, which now lives at
  /// the TOP of the page — so the page goes there too. Without this the tap
  /// looks like it did nothing: the field it filled is off screen.
  function nameFromCatalog(name: string) {
    setPestName(name);
    document.getElementById("new-pest")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }


  const run = useCallback(async (list: SavedPest[]) => {
    if (!list.length) { setData(null); return; }
    setBusy(true); setError("");
    try {
      // The id goes ALONG as `ref`, not away. Two rows can be the same
      // pest, and a computed answer has to say which saved one it is about.
      const r = await pestThreshold(
        region.id, list.map(({ id, regionId: _r, ...m }) => ({ ...m, ref: id })),
      );
      if (!r.success) { setError(r.error || "What you are watching could not be read."); return; }
      setData(r); setRanAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(models); }, [run, models]);

  function sortBy(col: ItemSort) {
    if (col === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(col); setDir("asc"); }
    setPageNo(0);
  }

  /// The record, joined to what the season said about it by `ref` — the saved
  /// item's own id, echoed back untouched. Two rows can name the same pest.
  const watched = models.map((m) => ({
    model: m,
    assessed: data?.pests?.find(
      (a) => (a.ref && a.ref === m.id) || (!a.ref && a.pest === m.pest),
    ),
  }));

  /// Rows the server could not evaluate, by name. A pest saved with no
  /// stages, no published model and no watch flag is one of these — it is not
  /// slow to load, there is simply nothing to compute against it.
  const skipped = new Map((data?.skipped ?? []).map((s) => [s.name, s.reason]));

  async function commitRow() {
    if (!draft) return;
    setSavingRow(true); setFormErr("");
    try {
      await storePest(draft);
      setEditing(""); setDraft(null);
    } catch (e) {
      setFormErr(String((e as Error).message ?? e));
    } finally { setSavingRow(false); }
  }

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Blank means "this block's base". Typed means what was typed, in the
    // scale on screen, converted back to the Fahrenheit the record keeps.
    const typed = String(f.get("base") ?? "").trim();
    const made = makePest(
      String(f.get("pest") ?? ""),
      typed ? u.toF(Number(typed)) : region.baseTempF,
      String(f.get("stages") ?? ""), region.id,
      String(f.get("biofix") ?? "") || undefined,
    );
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    void storePest(made).catch((e) => setFormErr(String(e.message ?? e)));
    setPestName("");
    e.currentTarget.reset();
  }


  const loadCatalog = useCallback(async () => {
    setCatBusy(true);
    try {
      const r = await pestCatalog(region.id);
      if (r.success) { setCat(r); setCatAt(new Date()); }
      else setError(r.error || "The pest catalogue could not be read.");
    } finally { setCatBusy(false); }
  }, [region.id]);

  return (
    <>
      <PageTitle>Pests</PageTitle>

      {error && <ErrorBox>{error}</ErrorBox>}

      <UndoBar kinds={["pest"]} onRestored={() => void reloadPests()} />

      {data && data.scout_now.length > 0 && (
        <div className="mb-5 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <span className="eyebrow">Active now</span>
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {data.scout_now.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}

      <div className="mb-3 flex items-center justify-end gap-1.5">
        <IconButton path={ICON.add} label="Pest" form="new-pest" title="Watch a pest" />
      </div>

      {/* ── Watch a pest ───────────────────────────────────────────────── */}
      <form id="new-pest" onSubmit={add} className="mb-4 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft">Pest
            <input name="pest" placeholder="Aster leafhopper"
              value={pestName} onChange={(e) => setPestName(e.target.value)}
              className={FIELD} /></label>
          {/* The block's own base is the placeholder rather than a hardcoded
              50: it is the number this ground's season curve is accumulated
              from, so leaving the field alone now agrees with the chart
              instead of quietly disagreeing with it. */}
          <label className="block text-[11px] text-ink-soft">
            Base{u.tempUnit}
            <Term>Development stops below this temperature, and it belongs to
              the creature rather than to your ground — a codling moth counts
              from 50&nbsp;°F and a cabbage maggot from 40&nbsp;°F on the same
              acre. Left blank it takes {region.name}&rsquo;s{" "}
              {u.showTemp(region.baseTempF)}.</Term>
            <input name="base" inputMode="numeric"
              placeholder={String(Math.round(u.temp(region.baseTempF)))}
              className={FIELD} /></label>
          <label className="block text-[11px] text-ink-soft">
            <Term label="Biofix">The day the count starts. For most published
              models it is the first sustained trap catch; leave it empty and
              the count runs from the first of January.</Term>{" "}
            <span className="opacity-60">(optional)</span>
            <input name="biofix" type="date" className={FIELD} /></label>
          <label className="block text-[11px] text-ink-soft">
            <Term label="Stages">A life-cycle event and the degree-day total it
              arrives at, comma separated. These are yours — Good Earth times
              them against this ground and does not publish entomology.</Term>
            <input name="stages" placeholder="first flight 375, second flight 1400"
              className={FIELD} /></label>
        </div>
        {formErr && <p className="mt-2 text-[12px] text-clay">{formErr}</p>}
      </form>

      <Section emoji="👀" title="What you're watching" first>
        {models.length > 0 && <Provenance tool="goodearth_pest_threshold" at={ranAt} onCost={onCost} />}
      </Section>

      {data?.summary && <p className="mb-2.5 text-[13px] text-ink-soft">{data.summary}</p>}

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <SearchBox value={search} placeholder="regex ok, e.g. moth|borer"
          onSearch={(t) => { setSearch(t); setPageNo(0); }} />
      </div>

      {/* Rows shaped like the wildlife calendar's: an icon, the name and its
          detail on one baseline, the data underneath. These were stacked cards
          with a heading inside, which is why the page read as a different app
          from its neighbours. */}
      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller heading="Checking what you're watching" />
        </div>
      ) : models.length ? (
        <>
          <div className="overflow-x-auto overscroll-x-contain rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <SortHeaders cols={columns(`${u.ddUnit.trim()} to date`)}
                  sort={sort} dir={dir} onSort={sortBy} />
              </thead>
              <tbody>
                {watched.map(({ model: m, assessed: a }) => (
                  editing === m.id && draft ? (
                    <Editor key={m.id} draft={draft} onChange={setDraft}
                      onCommit={commitRow} saving={savingRow}
                      onCancel={() => { setEditing(""); setDraft(null); }} />
                  ) : (
                    <tr key={m.id} className="border-b border-rule last:border-b-0">
                      <td onClick={() => { setEditing(m.id); setDraft(m); }}
                        className="cursor-text px-3 py-2.5 font-semibold">
                        <span className="mr-1.5 text-[15px]" aria-hidden="true">
                          {m.watch ? "👁️"
                            : (a?.stages ?? []).some((x) => !x.reached) ? "🥚" : "🐛"}
                        </span>
                        {m.pest}
                        {/* A vole has no development threshold, so it is not
                            given one. Printing "base 50 °F" under a creature
                            with no heat model states a fact that isn't. */}
                        {!m.watch && (
                          <small className="block text-[11px] font-normal text-ink-soft">
                            base {u.showTemp(m.base_temp ?? region.baseTempF)}
                          </small>
                        )}
                      </td>
                      <td onClick={() => { setEditing(m.id); setDraft(m); }}
                        className="cursor-text px-3 py-2.5 whitespace-nowrap">
                        {m.watch ? "—" : m.biofix ? d(m.biofix) : "Jan 1"}
                      </td>
                      <td className="data px-3 py-2.5 whitespace-nowrap text-[12px] text-ink-soft">
                        {a && !m.watch && a.gdd_accumulated != null
                          ? u.showDD(a.gdd_accumulated, 1) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {(a?.stages ?? []).length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(a?.stages ?? []).map((st) => (
                              <StatusChip key={st.stage} tone={st.reached ? "reached" : "pending"}>
                                {/* The remaining-GDD figure was in a title
                                    attribute, which is unreachable with a finger. */}
                                <span>{st.stage} <span className="data text-[10.5px] text-ink-soft">{u.degreeDays(st.gdd).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                                {st.reached
                                  ? <span className="text-honey">
                                      {st.crossed_on ? d(st.crossed_on) : "✓"}
                                    </span>
                                  : <span className="data text-[10.5px] text-ink-soft">
                                      · {st.projected_date ? d(st.projected_date) : `${Math.round(u.degreeDays(st.gdd_remaining))} to go`}
                                    </span>}
                              </StatusChip>
                            ))}
                          </div>
                        ) : m.watch ? (
                          <span className="data text-[11px] text-ink-soft">watched all season</span>
                        ) : m.model ? (
                          <span className="data text-[11px] text-ink-soft">
                            {m.model.toUpperCase()} model · no dated stage for this ground yet
                          </span>
                        ) : (
                          /* The server refused this row and said why. Until
                             now the page printed "not yet read", which reads
                             as a load that has not finished rather than as a
                             pest with nothing to compute against. */
                          <button
                            onClick={() => { setEditing(m.id); setDraft(m); }}
                            className="data text-left text-[11px] text-clay underline decoration-dotted underline-offset-2"
                          >
                            {skipped.get(m.pest) ? "no thresholds — tap to set" : "not yet read"}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button onClick={() => {
                          remembered({
                            kind: "pest", blockId: region.id, label: m.pest,
                            item: pestCodec.to(m) as Record<string, unknown>,
                          });
                          void retirePest(m.id);
                        }}
                          aria-label={`Remove ${m.pest}`}
                          className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={pages} total={total} noun="pest" onPage={setPageNo} />
        </>
      ) : modelsLoading ? (
        <Empty>Reading what you have on {region.name}…</Empty>
      ) : modelsUnknown ? (
        <ErrorBox>This browser is set to ground the record does not have. Pick the block again from Favorites, or save it on the Map.</ErrorBox>
      ) : modelsError ? (
        <ErrorBox>Could not read your record for {region.name}: {modelsError}</ErrorBox>
      ) : (
        <Empty>
          {search
            ? "Nothing matches that. Clear the search to see everything you watch."
            : `Nothing being watched on ${region.name} yet. Take one from Nearby below, or add your own above.`}
        </Empty>
      )}

      <Section emoji="🔭" title="Nearby">
        {!cat && (
          <Pill onClick={loadCatalog} disabled={catBusy} active>
            {catBusy ? "🧠 Reading…" : "🧠 What's here?"}
          </Pill>
        )}
        {cat && <Provenance tool="goodearth_pest_catalog" at={catAt} onCost={onCost} />}
      </Section>

      {cat ? (
        <>
          <p className="eyebrow">Modelled stages</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(cat.events ?? []).map((e) => (
              <Chiclet key={e.model} emoji={e.passed ? "🐛" : "🥚"} name={e.name}
                figure={d(e.date)}
                tone={e.passed ? "border-honey/50 bg-honey/8" : "border-rule bg-panel"}
                title={`${e.name} — due ${d(e.date)} here. Tap to watch it.`}
                onClick={() => nameFromCatalog(e.name)} />
            ))}
          </div>
          {(cat.insects_recorded ?? []).length > 0 && (
            <>
              <p className="eyebrow mt-4">Sightings</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(cat.insects_recorded ?? []).slice(0, 18).map((i) => (
                  <Chiclet key={i.name} emoji="🔍" name={i.name} figure={i.observations.toLocaleString()}
                    title={`${i.observations.toLocaleString()} sightings near here. Tap to watch it.`}
                    onClick={() => nameFromCatalog(i.name)} />
                ))}
              </div>
            </>
          )}
          {/* Provenance, and the one instruction. How many of NPN's layers
              answered with a heat total rather than a date is this service's
              own bookkeeping — it changes nothing the grower does. */}
          <Note>
            Dated stages from USA-NPN · sightings from iNaturalist within{" "}
            {cat.search_span_km} km. Edit a pest to set its thresholds.
          </Note>
        </>
      ) : (
        <Note>Plot-specific pests from USA-NPN.</Note>
      )}
    </>
  );
}

/// One pest model, open for editing.
///
/// In the row rather than in a form above the table, so the thing being
/// changed stays where it was read. Until this existed, fixing a threshold
/// meant deleting the pest and typing it all again — including every stage.
function Editor({ draft, onChange, onCommit, onCancel, saving }: {
  draft: SavedPest;
  onChange: (p: SavedPest) => void;
  onCommit: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const u = useUnits();
  const set = (patch: Partial<SavedPest>) => onChange({ ...draft, ...patch });
  /// Shown in the reader's scale, held in Fahrenheit. `defaultValue` rather
  /// than `value`: rounding a converted figure on every keystroke would fight
  /// the person typing it.
  const base = draft.base_temp == null ? "" : String(Math.round(u.temp(draft.base_temp)));
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onCommit(); }
    if (e.key === "Escape") onCancel();
  };
  /// Stages round-trip through the same "name 375, name 1400" text the add
  /// form takes, so there is one grammar to learn rather than two.
  const asText = (draft.stages ?? []).map((s) => `${s.stage} ${s.gdd}`).join(", ");
  const parseStages = (text: string) => text.split(",").map((chunk) => {
    const m = chunk.trim().match(/^(.*?)[\s:]+(\d+(?:\.\d+)?)$/);
    return m ? { stage: m[1].trim(), gdd: Number(m[2]) } : null;
  }).filter((x): x is { stage: string; gdd: number } => x !== null);

  return (
    <tr className="border-b border-rule bg-band/40 last:border-b-0">
      <td className="px-3 py-2 align-top">
        <input autoFocus value={draft.pest} className={CELL} onKeyDown={keys}
          onChange={(e) => set({ pest: e.target.value })} />
        <input inputMode="numeric" defaultValue={base} className={`${CELL} mt-1`}
          placeholder={`base${u.tempUnit}`} onKeyDown={keys}
          onChange={(e) => set({
            base_temp: e.target.value.trim() === "" ? undefined : u.toF(Number(e.target.value)),
          })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input type="date" value={draft.biofix ?? ""} className={CELL} onKeyDown={keys}
          onChange={(e) => set({ biofix: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top" colSpan={2}>
        <input defaultValue={asText} className={CELL} onKeyDown={keys}
          placeholder="first flight 375, second flight 1400"
          onChange={(e) => set({ stages: parseStages(e.target.value) })} />
      </td>
      <td className="px-2 py-2 text-right align-top whitespace-nowrap">
        <RowActions onCommit={onCommit} onCancel={onCancel} saving={saving} what="pest" />
      </td>
    </tr>
  );
}
