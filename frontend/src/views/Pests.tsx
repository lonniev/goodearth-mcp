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

/// Sort keys mirror the server's whitelist. Heat-so-far and the stage chips
/// are computed for the page in hand, not held in the record, so they are not
/// offered as columns to order by — a header that quietly does nothing is
/// worse than one that is plainly inert.
const COLS: Column<ItemSort>[] = [
  { key: "name", label: "Pest" },
  { key: "starts_on", label: "Biofix" },
  { label: "Heat so far" },
  { label: "Stages", width: "44%" },
  { label: "" },
];

export default function Pests({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
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
  const { items: models, save: storePest, retire: retirePest,
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
    const made = makePest(
      String(f.get("pest") ?? ""), Number(f.get("base") || 50),
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

      {data && data.scout_now.length > 0 && (
        <div className="mb-5 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <span className="eyebrow">Watch for these now</span>
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
          <label className="block text-[11px] text-ink-soft">Base °F
            <input name="base" inputMode="numeric" placeholder="50" className={FIELD} /></label>
          <label className="block text-[11px] text-ink-soft">Biofix <span className="opacity-60">(optional)</span>
            <input name="biofix" type="date" className={FIELD} /></label>
          <label className="block text-[11px] text-ink-soft">Stages
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
                <SortHeaders cols={COLS} sort={sort} dir={dir} onSort={sortBy} />
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
                          {(a?.stages ?? []).some((x) => !x.reached) ? "🥚" : "🐛"}
                        </span>
                        {m.pest}
                        <small className="block text-[11px] font-normal text-ink-soft">
                          base {m.base_temp ?? 50}°F
                        </small>
                      </td>
                      <td onClick={() => { setEditing(m.id); setDraft(m); }}
                        className="cursor-text px-3 py-2.5 whitespace-nowrap">
                        {m.biofix ? d(m.biofix) : "Jan 1"}
                      </td>
                      <td className="data px-3 py-2.5 whitespace-nowrap text-[12px] text-ink-soft">
                        {a ? `${a.gdd_accumulated?.toLocaleString()} GDD` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {a ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(a.stages ?? []).map((st) => (
                              <StatusChip key={st.stage} tone={st.reached ? "reached" : "pending"}>
                                {/* The remaining-GDD figure was in a title
                                    attribute, which is unreachable with a finger. */}
                                <span>{st.stage} <span className="data text-[10.5px] text-ink-soft">{st.gdd.toLocaleString()}</span></span>
                                {st.reached
                                  ? <span className="text-honey">✓</span>
                                  : <span className="data text-[10.5px] text-ink-soft">
                                      · {st.projected_date ? d(st.projected_date) : `${Math.round(st.gdd_remaining)} to go`}
                                    </span>}
                              </StatusChip>
                            ))}
                          </div>
                        ) : (
                          <span className="data text-[11px] text-ink-soft">
                            {m.watch ? "watched all season — no stages to date" : "not yet read"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button onClick={() => void retirePest(m.id)}
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
          <Note>
            Dated stages come from USA-NPN's degree-day forecasts for this region, and
            the sightings from iNaturalist within about {cat.search_span_km} km — species
            are a landscape fact, and one field holds almost no records.{" "}
            {cat.models_unreadable ? `${cat.models_unreadable} of ${cat.models_published} published forecasts give a heat total or a risk level rather than a date, so they are left out rather than guessed at. ` : ""}
            Tapping one names the pest and nothing else. The heat numbers that say
            when it arrives are yours to set against your own extension bulletin —
            Good Earth does not publish entomology or recommend a treatment.
          </Note>
        </>
      ) : (
        <Note>
          USA-NPN models a set of pests nationally and Good Earth reads them for this
          ground, so the answer here is not the answer for an orchard two states south.
          What comes back is a date for the region, not the numbers that time it on
          your ground. Those stay yours.
        </Note>
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
  const set = (patch: Partial<SavedPest>) => onChange({ ...draft, ...patch });
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
        <input inputMode="numeric" value={draft.base_temp ?? ""} className={`${CELL} mt-1`}
          placeholder="base °F" onKeyDown={keys}
          onChange={(e) => set({ base_temp: e.target.value.trim() === "" ? undefined : Number(e.target.value) })} />
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
