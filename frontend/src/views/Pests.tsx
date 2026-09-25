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
import { QuoteScroller } from "@tollbooth-dpyc/web/react";
import { AGRARIAN_QUOTES, AGRARIAN_SOURCE } from "../lib/quotes";
import { Pager, SortHeaders, type Column } from "../components/RecordTable";
import SearchBox from "../components/SearchBox";
import TableFilter from "../components/TableFilter";
import { isOn as pestFilterOn, matches as pestMatches, NO_PEST_FILTER,
  summarise as pestFilterWords, type PestFilter } from "../lib/pestFilter";
import SpeciesPicker from "../components/SpeciesPicker";
import SpeciesCard from "../components/SpeciesCard";
import type { SpeciesHit } from "../lib/species";
import { remembered } from "../lib/undoEvents";
import Term from "../components/Term";
import { useUnits } from "../components/Units";
import {
  CELL, Chiclet, Empty, ErrorBox, Field, FIELD, ICON, IconButton, Note, PageTitle, Pill,
  RowActions, Section, StatusChip, TrashGlyph,
} from "../components/ui";
import { useBlockItems, type ItemSort } from "../lib/blockItems";
import { useSubmit } from "../lib/useSubmit";
import { withId } from "../lib/submit";
import { pestCatalog, pestThreshold, type PestCatalogResult, type PestWindowResult } from "../lib/mcp";
import {
  makePest, makeWatch, pestCodec, type SavedPest,
} from "../lib/pestModels";
import SpeciesFinder from "../components/SpeciesFinder";
import type { Chosen } from "../lib/basket";
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
      info: <>Growing Degree Days banked since the Biofix: each day contributes
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
  const [filter, setFilter] = useState<PestFilter>(NO_PEST_FILTER);
  /// A filter has to see the whole block, not a page of it — the same reason
  /// the Plant ledger widens while one is on.
  const narrowed = pestFilterOn(filter);
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState<SavedPest | null>(null);
  const [savingRow, setSavingRow] = useState(false);

  // Read from the grower's record under their npub, not from this browser.
  const { items: models, save: storePest, saveMany: storeMany,
          retire: retirePest,
          loading: modelsLoading, error: modelsError,
          unknownBlock: modelsUnknown, total, page, pages } =
    useBlockItems<SavedPest>(region.id, "pest", pestCodec, undefined, {
      sortCol: sort, sortDir: dir, page: narrowed ? 0 : pageNo, search,
      pageSize: narrowed ? 200 : 20,
    });
  const [data, setData] = useState<PestWindowResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [formErr, setFormErr] = useState("");
  const submit = useSubmit("pe", setFormErr);
  const [cat, setCat] = useState<PestCatalogResult | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [catAt, setCatAt] = useState<Date | null>(null);
  /// Tapping a catalogue entry names the pest and leaves the numbers blank.
  /// The species is a fact about this country; the threshold is the grower's.
  const [pestName, setPestName] = useState("");
  /// What the catalogue resolved, when it did. A typed name with no pick is
  /// still a pest — it simply carries no taxon for later lookups.
  const [picked, setPicked] = useState<SpeciesHit | null>(null);
  /// A name handed to the picker from elsewhere on the page, so tapping a
  /// modelled stage searches for that creature rather than dropping a bare
  /// string into the record.
  const [seedName, setSeedName] = useState("");
  const [pickKey, setPickKey] = useState(0);
  /// The taxon whose card is open under the picker, if any.
  const [reading, setReading] = useState<number | null>(null);

  /// Naming a pest from the catalogue below fills the form, which now lives at
  /// the TOP of the page — so the page goes there too. Without this the tap
  /// looks like it did nothing: the field it filled is off screen.
  function nameFromCatalog(name: string) {
    // Into the picker rather than into a bare text box, so a tapped stage
    // arrives with the taxon the catalogue is talking about.
    setPicked(null);
    setPestName(name);
    setSeedName(name);
    // Remount, so tapping the SAME stage twice searches again. The picker
    // seeds off an effect keyed on the name, and a name that has not changed
    // fires nothing — the second tap would look like the page ignoring it.
    setPickKey((k) => k + 1);
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

  /// The rows the question is about.
  const shown = narrowed
    ? watched.filter(({ model, assessed }) => pestMatches(model, assessed, filter))
    : watched;

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

  /// Put a basket of chosen creatures on the record in ONE write.
  ///
  /// They arrive WATCHED: named, with no base temperature and no stages. That
  /// is the honest state for most of what a scout finds — a vole has no
  /// degree-day model and demanding one is how invented numbers get in.
  const [addingMany, setAddingMany] = useState(false);
  async function addChosen(chosen: Chosen[]) {
    if (!chosen.length) return;
    setAddingMany(true);
    try {
      const made = chosen.map((c) => makeWatch(c.name, region.id, {
        taxonId: c.taxonId, scientificName: c.scientificName,
      })).filter((m): m is SavedPest => typeof m !== "string");
      await storeMany(made);
    } catch (e) {
      setFormErr(String((e as Error).message ?? e));
    } finally { setAddingMany(false); }
  }

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Blank means "this block's base". Typed means what was typed, in the
    // scale on screen, converted back to the Fahrenheit the record keeps.
    const typed = String(f.get("base") ?? "").trim();
    const made = makePest(
      picked?.commonName || picked?.scientificName || pestName,
      typed ? u.toF(Number(typed)) : region.baseTempF,
      String(f.get("stages") ?? ""), region.id,
      String(f.get("biofix") ?? "") || undefined,
      picked ? { taxonId: picked.id, scientificName: picked.scientificName } : undefined,
    );
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    // Captured before the await: `currentTarget` is nulled when this returns.
    const form = e.currentTarget;
    submit.run(async (key) => {
      await storePest(withId(made, key));
      setPestName(""); setPicked(null); setSeedName(""); setReading(null);
      form.reset();
    });
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


      {data && data.scout_now.length > 0 && (
        <div className="mb-5 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <span className="eyebrow">Active now</span>
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {data.scout_now.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* ── Watch a pest ───────────────────────────────────────────────── */}
      <form id="new-pest" onSubmit={add} className="mb-4 rounded-md border border-rule bg-panel p-4">
        {/* Every caption on one line, every box one height, and the act at the
            end of the flow rather than on a row of its own — the same shape
            the seed and cut rows now have. The button keeps its place AFTER
            the boxes, which is what a tester asked for; what it gives up is a
            whole row of the page to say so. */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2.5">
          {/* Named from the catalogue that knows creatures, rather than typed
              and hoped for. `animals` and not `insects`: a grower's pest list
              already holds a chipmunk and a slug, and neither is an insect. A
              typed name still stands when iNaturalist has not heard of it —
              "pest" is the grower's word for whatever is eating the crop. */}
          <Field label="Pest" width="min-w-[15rem] flex-1">
            <SpeciesPicker key={pickKey} kingdom="animals" seed={seedName}
              value={picked && {
                commonName: picked.commonName ?? undefined,
                scientificName: picked.scientificName,
                thumb: picked.thumb,
              }}
              placeholder="aster leafhopper, vole, slug…"
              onPick={(hit) => { setPicked(hit); setReading(null); setPestName(hit.commonName || hit.scientificName); }}
              onClear={() => { setPicked(null); setPestName(""); }}
              onText={setPestName}
              onRead={() => setReading((r) => (r ? null : picked?.id ?? null))} />
            {/* The same card the nearby list opens. A chosen creature should
                be as readable here as it is there — this is the one place a
                grower is deciding whether it is the right one. */}
            {reading != null && picked && (
              <div className="mt-2">
                <SpeciesCard taxonId={reading} fallbackName={pestName}
                  onClose={() => setReading(null)} />
              </div>
            )}
          </Field>

          {/* The block's own base is the placeholder rather than a hardcoded
              50: it is the number this ground's season curve is accumulated
              from, so leaving the field alone now agrees with the chart
              instead of quietly disagreeing with it. */}
          <Field label={`Base${u.tempUnit}`} htmlFor="pest-base" width="w-[7rem]"
            hint={
              <Term of="base_temp">
                A codling moth counts from 50&nbsp;°F and a cabbage maggot from
                40&nbsp;°F on the same acre. Left blank it takes{" "}
                {region.name}&rsquo;s {u.showTemp(region.baseTempF)}.
              </Term>
            }>
            <input id="pest-base" name="base" inputMode="numeric"
              placeholder={String(Math.round(u.temp(region.baseTempF)))}
              className={FIELD} />
          </Field>

          <Field label="Biofix" htmlFor="pest-biofix" width="w-[10rem]"
            hint={
              <Term of="biofix">
                Leave it empty and the count runs from the first of January.
              </Term>
            }>
            <input id="pest-biofix" name="biofix" type="date" className={FIELD} />
          </Field>

          <Field label="Stages" htmlFor="pest-stages" width="min-w-[15rem] flex-1"
            hint={
              <Term of="threshold">
                A life-cycle event and the degree-day total it arrives at, comma
                separated. Good Earth times them against this ground and does not
                publish entomology. Leave it empty to just watch the creature.
              </Term>
            }>
            <input id="pest-stages" name="stages" placeholder="first flight 375, second flight 1400"
              className={FIELD} />
          </Field>

          <span className="pt-3.5">
            <IconButton path={ICON.bug} label="Pest" hideLabel form="new-pest"
              title="Watch a pest" disabled={submit.busy} />
          </span>
        </div>
        {formErr && <p className="mt-2 text-[12px] text-clay">{formErr}</p>}
      </form>

      {/* One row where there were three, and the same row the Plant ledger
          has: the heading carries its own reading time, the filter and the
          search sit together on the right, and the summary sentence is gone.
          "Nothing crossed or due in the next 10 days" is a fact about the
          list the list already shows. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Section emoji="👀" first
          title={`What you're watching${ranAt
            ? ` (at ${ranAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`
            : ""}`}>
          {models.length > 0 && (
            <Provenance tool="goodearth_pest_threshold" at={ranAt} onCost={onCost} hideTime />
          )}
        </Section>
        <div className="ml-auto flex items-center gap-2">
          <TableFilter value={filter} empty={NO_PEST_FILTER} summary={pestFilterWords(filter)}
            onChange={(f) => { setFilter(f); setPageNo(0); }}
            questions={[
              { kind: "number", key: "dueDays", label: "Due within", unit: "days" },
              { kind: "toggle", key: "crossed", label: "Crossed this season" },
              { kind: "toggle", key: "watchedOnly", label: "Watched, no model" },
            ]} />
          <SearchBox value={search} placeholder="regex ok, e.g. moth|borer"
            onSearch={(t) => { setSearch(t); setPageNo(0); }} />
        </div>
      </div>

      {/* Rows shaped like the wildlife calendar's: an icon, the name and its
          detail on one baseline, the data underneath. These were stacked cards
          with a heading inside, which is why the page read as a different app
          from its neighbours. */}
      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller quotes={AGRARIAN_QUOTES} source={AGRARIAN_SOURCE} heading="Checking what you're watching" intervalMs={6500} className="quote-scroller" />
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
                {shown.map(({ model: m, assessed: a }) => (
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
                          aria-label={`Remove ${m.pest}`} title="Remove"
                          className="inline-flex h-11 w-11 items-center justify-center text-ink-soft active:text-clay"><TrashGlyph /></button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
          {/* While a filter is on the block is already all here and the count
              that matters is what answered, so the pager stands down rather
              than counting past a list it is not describing. */}
          {narrowed ? (
            <p className="data mt-1 text-[11px] text-ink-soft">
              {shown.length} of {models.length}
              {total > models.length ? ` · filtering the first ${models.length} of ${total}` : ""}
            </p>
          ) : (
            <Pager page={page} pages={pages} total={total} noun="pest" onPage={setPageNo} />
          )}
        </>
      ) : modelsLoading ? (
        <Empty>Reading what you have on {region.name}…</Empty>
      ) : modelsUnknown ? (
        <ErrorBox>This browser is set to ground the record does not have. Pick the block again from My Plots, or draw it there.</ErrorBox>
      ) : modelsError ? (
        <ErrorBox>Could not read your record for {region.name}: {modelsError}</ErrorBox>
      ) : (
        <Empty>
          {search
            ? "Nothing matches that. Clear the search to see everything you watch."
            : `Nothing being watched on ${region.name} yet. Take one from Nearby below, or add your own above.`}
        </Empty>
      )}

      <Section emoji="🐛" title="When they appear here">
        {!cat && (
          <Pill onClick={loadCatalog} disabled={catBusy} active>
            {catBusy ? "🧠 Reading…" : "🧠 What's here?"}
          </Pill>
        )}
        {cat && <Provenance tool="goodearth_pest_catalog" at={catAt} onCost={onCost} />}
      </Section>

      {cat ? (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(cat.events ?? []).map((e) => (
              <Chiclet key={e.model} emoji={e.passed ? "🐛" : "🥚"} name={e.name}
                figure={d(e.date)}
                tone={e.passed ? "border-honey/50 bg-honey/8" : "border-rule bg-panel"}
                title={`${e.name} — due ${d(e.date)} here. Tap to put ${e.pest ?? e.name} on your list.`}
                onClick={() => nameFromCatalog(e.pest || e.name)} />
            ))}
          </div>
              {/* Provenance, and the one instruction. How many of NPN's layers
              answered with a heat total rather than a date is this service's
              own bookkeeping — it changes nothing the grower does. */}
          <Note>
            A published degree-day model, dated for this ground. Edit a pest
            to set its own thresholds.
          </Note>
        </>
      ) : (
        <Note>Plot-specific pests from USA-NPN.</Note>
      )}

      {/* ── What is actually out there ──────────────────────────────────
          The sightings list used to sit above, capped at eighteen with no way
          to see the rest — of 3,542 insects and spiders recorded around one
          block. Searching is the only shape that fits that. */}
      <Section emoji="🔭" title="Community Observations" />
      <SpeciesFinder
        block={region.id}
        blockName={region.name}
        kingdom="insects"
        adding={addingMany}
        hint="What people have actually seen near here, rather than what is modelled above. Choose any number, keep searching, then add them all — they go on as watched, with no thresholds. A degree-day model is yours to add, and voles and slugs never get one."
        onAdd={addChosen}
      />
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
  /// A stage whose figure is missing prints its name alone.
  ///
  /// It printed "adult undefined". The record's own type says a stage carries
  /// a number, but a row written through the MCP by an agent need not have
  /// obeyed it — and the editor's job is to show what is there, not to put
  /// the word `undefined` in a box a grower can save.
  const figure = (g: unknown) => (typeof g === "number" && Number.isFinite(g) ? String(g) : "");
  const asText = (draft.stages ?? [])
    .map((s) => `${s.stage} ${figure(s.gdd)}`.trim()).join(", ");

  /// Parse the text back, keeping what it cannot parse rather than dropping it.
  ///
  /// A chunk naming a stage with no figure used to vanish on save — so
  /// opening the editor on such a pest and pressing ✓ deleted the stages the
  /// grower had never touched. Now the original object is carried through
  /// untouched: this form does not invent a figure, and it does not destroy a
  /// row for want of one.
  const parseStages = (text: string) => text.split(",").map((chunk) => {
    const t = chunk.trim();
    if (!t) return null;
    const m = t.match(/^(.*?)[\s:]+(\d+(?:\.\d+)?)$/);
    if (m) return { stage: m[1].trim(), gdd: Number(m[2]) };
    const kept = (draft.stages ?? []).find((s) => s.stage === t);
    return kept ?? null;
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
