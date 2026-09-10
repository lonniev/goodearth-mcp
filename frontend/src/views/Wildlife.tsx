// Wildlife — the other creatures working the same season.
//
// A farm is not only its crops. Growers have always read the year by the
// robins and the squirrels, and those are not folklore: the same drivers that
// time a crop time the animals.
//
// Three clocks, shown as three clocks, because which one an event runs on
// changes how much to trust the date. A daylight event is astronomy and barely
// moves; a heat event moves with the season.

import { useCallback, useEffect, useState } from "react";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import { Pager, SortHeaders, type Column } from "../components/RecordTable";
import SearchBox from "../components/SearchBox";
import UndoBar, { remembered } from "../components/UndoBar";
import { wildlifeCalendar, type WildlifeResult, type WildlifeRow } from "../lib/mcp";
import { useBlockItems, type ItemSort } from "../lib/blockItems";
import { photosByName } from "../lib/species";
import { makeRoster, wildlifeCodec, type SavedWildlife } from "../lib/wildlifeModels";
import EventComposer from "../components/EventComposer";
import DueSoon from "../components/DueSoon";
import { makeReport, reportCodec, type FieldReport } from "../lib/reports";
import { cycleOf, dueList, nextCycle, repeatable,
  type CycleDraft } from "../lib/husbandry";
import SpeciesFinder from "../components/SpeciesFinder";
import type { Chosen } from "../lib/basket";
import type { SavedRegion } from "../lib/regions";
import {
  CELL, Empty, ErrorBox, PageTitle, RowActions, Section, SpeciesMark,
} from "../components/ui";
import { speciesHabits, type SpeciesHabitsResult } from "../lib/mcp";

const CLOCK: Record<string, { label: string; cls: string }> = {
  heat:      { label: "heat",       cls: "bg-growth/12 text-growth" },
  daylight:  { label: "daylight",   cls: "bg-honey/15 text-honey" },
  interval:  { label: "days from",  cls: "bg-clay/12 text-clay" },
  calendar:  { label: "your record", cls: "bg-band text-ink-soft" },
  condition: { label: "conditions", cls: "bg-growth/12 text-growth" },
};

/// A driver this page has no chip for is still a row worth showing.
///
/// `CLOCK[m.driver]` returning undefined would take out the whole table on the
/// next render — the same fault, in the same week, that a missing branch in
/// the calendar's driver dispatch caused server-side. A record may legitimately
/// hold a driver this build has never heard of: an agent writes it through the
/// MCP, or the browser is a version behind the service.
const clockOf = (driver: string) =>
  CLOCK[driver] ?? { label: driver, cls: "bg-band text-ink-soft" };

const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/// Species and event sort in the database; the clock and the computed date do
/// not, so they are not offered as headers that would quietly do nothing.
const COLS: Column<ItemSort>[] = [
  { key: "name", label: "Creature" },
  { key: "event", label: "Event" },
  { key: "driver", label: "Clock" },
  { label: "When", width: "38%" },
  { label: "" },
];

export default function Wildlife({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  // Read from the grower's record under their npub, not from this browser.
  // Order, search and paging are the database's — it sorts every watch on the
  // block, not the twenty in hand. Search runs on submit: a read costs sats.
  const [sort, setSort] = useState<ItemSort>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [pageNo, setPageNo] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState<SavedWildlife | null>(null);
  const [savingRow, setSavingRow] = useState(false);

  const { items: models, save: storeWildlife, saveMany: storeMany,
          retire: retireWildlife, retireMany, reload: reloadWildlife,
          loading: modelsLoading, error: modelsError,
          unknownBlock: modelsUnknown, total, page, pages } =
    useBlockItems<SavedWildlife>(region.id, "wildlife", wildlifeCodec, undefined, {
      sortCol: sort, sortDir: dir, page: pageNo, search, pageSize: 20,
    });
  /// What the grower has actually seen. A projection nobody has answered and
  /// one they answered on the 24th are different states, and only the record
  /// of observations tells them apart.
  const { items: seen, save: storeSeen, reload: reloadSeen } =
    useBlockItems<FieldReport>(region.id, "observation", reportCodec);
  const [data, setData] = useState<WildlifeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  /// A cycle handed to the composer from the record — "start another brood".
  const [seed, setSeed] = useState<(CycleDraft & { supersedes?: string[] }) | null>(null);

  /// iNaturalist's photograph for each creature on the table, by name.
  ///
  /// A row added from the roster carries no emoji and used to draw a bullet,
  /// while the catalogue further down this same page showed a real photograph
  /// of the same animal. One barred owl should not be a picture in one place
  /// and a dot in another.
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  // Both lists on the page: the saved rows AND whatever the season put in
  // "watch for these", which is not always a subset of them.
  const speciesKey = [...new Set([
    ...models.map((m) => m.species),
    ...(data?.due_soon ?? []).map((e) => e.species),
  ].map((n) => (n ?? "").trim()).filter(Boolean))].sort().join("|");
  useEffect(() => {
    const names = speciesKey ? speciesKey.split("|") : [];
    if (!names.length) return;
    const ac = new AbortController();
    void photosByName(names, "animals", ac.signal)
      .then((m) => { if (!ac.signal.aborted) setPhotos(m); });
    return () => ac.abort();
  }, [speciesKey]);

/// Which kingdom the finder is looking through. Fungi are creatures a
  /// grower watches too — 940 of them are recorded around one block — and
  /// they have no other home in the app.
  const [kingdom, setKingdom] = useState<"wildlife" | "fungi">("wildlife");

  /// Put a basket of chosen creatures on the roster in ONE write.
  ///
  /// Named and undated. `makeWildlife` demands an event and a driver's figure,
  /// which is right for a tracked event and wrong for "barred owls are here" —
  /// and the chart has always skipped a driverless row on purpose.
  const [addingMany, setAddingMany] = useState(false);
  async function addChosen(chosen: Chosen[]) {
    if (!chosen.length) return;
    setAddingMany(true);
    try {
      const made = chosen.map((c) => makeRoster(c.name, region.id, {
        taxonId: c.taxonId, scientificName: c.scientificName,
      })).filter((m): m is SavedWildlife => typeof m !== "string");
      await storeMany(made);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally { setAddingMany(false); }
  }
  const [catAt] = useState<Date | null>(null);
  /// The animal whose habits are open, and what USA-NPN tracks it doing.
  const [habitsOf, setHabitsOf] = useState<{ name: string } | null>(null);
  const [habits, setHabits] = useState<SpeciesHabitsResult | null>(null);
  const [habitsBusy, setHabitsBusy] = useState(false);


  const run = useCallback(async (list: SavedWildlife[]) => {
    if (!list.length) { setData(null); return; }
    setBusy(true); setError("");
    try {
      const r = await wildlifeCalendar(
        region.id,
        // The id goes ALONG as `ref`. One species can hold several events —
        // a migration arrival and a departure — and only this separates them.
        list.map(({ id, regionId: _r, ...e }) => ({ ...e, ref: id })),
      );
      if (!r.success) { setError(r.error || "The calendar could not be read."); return; }
      setData(r); setRanAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(models); }, [run, models]);

  const today = new Date().toISOString().slice(0, 10);

  /// Watches whose day is near, and the ones whose day has just been and gone
  /// with nothing recorded against them. `due_soon` answers only the first
  /// half — a reached row carries no projection and drops out of it.
  const answered = new Set(seen.map((o) => o.ref).filter((r): r is string => !!r));
  const due = dueList(data?.events ?? [], answered, today);

  const [marking, setMarking] = useState(false);

  /// What the grower saw, on the day they saw it, joined to the watch it
  /// settles. The join is the saved row's own id, which is what the calendar
  /// echoes back as `ref` — a note that merely shares a date with a projection
  /// is not the same claim.
  async function markSeen(row: WildlifeRow, observedOn: string) {
    setMarking(true); setError("");
    try {
      const made = makeReport({
        regionId: region.id, tag: row.event || "seen",
        observedOn, note: `${row.species} — ${row.event}`,
        crop: row.species, ...(row.ref ? { ref: row.ref } : {}),
      });
      if (typeof made === "string") { setError(made); return; }
      await storeSeen(made);
      await reloadSeen();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally { setMarking(false); }
  }

  /// The same cycle, started again on a new day.
  ///
  /// Poultry set several times a season. The labels and the counts come off
  /// the rows the grower already saved — nothing here decides how long a
  /// clutch takes — and the composer asks only for the day.
  function startAnother(species: string) {
    const rows = cycleOf(models, species);
    const draft = nextCycle(rows, today);
    if (typeof draft === "string") { setError(draft); return; }
    setError("");
    setSeed({ ...draft, supersedes: rows.map((r) => r.id) });
  }

  /// Save the composed cycle, then retire what it replaced.
  ///
  /// In that order, and only on success: a brood retired before its
  /// replacement lands would leave the grower with neither.
  async function saveComposed(rows: SavedWildlife[], supersedes: string[]) {
    await storeMany(rows);
    if (supersedes.length) await retireMany(supersedes);
  }

  function sortBy(col: ItemSort) {
    if (col === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(col); setDir("asc"); }
    setPageNo(0);
  }

  /// The record, joined to what the year said about it by `ref` — the saved
  /// item's own id. It used to match on species AND event, which is the right
  /// natural key but still only a guess; the ref is the grower's actual row.
  const watched = models.map((m) => ({
    model: m,
    seen: data?.events?.find(
      (e) => (e.ref && e.ref === m.id)
        || (!e.ref && e.species === m.species && e.event === m.event),
    ),
  }));

  async function commitRow() {
    if (!draft) return;
    setSavingRow(true); setError("");
    try {
      await storeWildlife(draft);
      setEditing(""); setDraft(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally { setSavingRow(false); }
  }

  const openHabits = useCallback(async (common: string, sci?: string) => {
    if (!sci) return;
    setHabitsOf({ name: common }); setHabits(null); setHabitsBusy(true);
    try {
      setHabits(await speciesHabits(region.id, sci));
    } finally { setHabitsBusy(false); }
  }, [region.id]);

  return (
    <>
      <PageTitle>Wildlife</PageTitle>

      {error && <ErrorBox>{error}</ErrorBox>}

      <UndoBar kinds={["wildlife"]} onRestored={() => void reloadWildlife()} />

      <DueSoon
        due={due}
        photos={photos}
        today={today}
        busy={marking}
        canRepeat={(sp) => repeatable(cycleOf(models, sp))}
        onRepeat={startAnother}
        onObserved={markSeen} />

      <Section emoji="📅" title="The year" first>
        {models.length > 0 && <Provenance tool="goodearth_wildlife_calendar" at={ranAt} onCost={onCost} />}
      </Section>
      {data?.summary && <p className="mb-2.5 text-[13px] text-ink-soft">{data.summary}</p>}

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <SearchBox value={search} placeholder="regex ok, e.g. robin|migration"
          onSearch={(t) => { setSearch(t); setPageNo(0); }} />
      </div>

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel"><QuoteScroller heading="Reading the year" /></div>
      ) : models.length ? (
        <>
          <div className="overflow-x-auto overscroll-x-contain rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <SortHeaders cols={COLS} sort={sort} dir={dir} onSort={sortBy} />
              </thead>
              <tbody>
                {watched.map(({ model: m, seen: e }) => {
                  const clock = clockOf(m.driver);
                  const when = e?.reached_on ?? e?.projected_date;
                  const past = !!e?.reached_on;
                  const open = () => { setEditing(m.id); setDraft(m); };
                  return editing === m.id && draft ? (
                    <Editor key={m.id} draft={draft} onChange={setDraft}
                      onCommit={commitRow} saving={savingRow}
                      onCancel={() => { setEditing(""); setDraft(null); }} />
                  ) : (
                    <tr key={m.id} className="border-b border-rule last:border-b-0">
                      <td onClick={open} className="cursor-text px-3 py-2.5 font-semibold">
                        {/* The grower's own emoji wins where they typed one:
                            they chose it for this row and it is theirs. Then
                            the taxon's photograph, and only then a seedling —
                            never a bullet, which said nothing about the
                            animal it stood for. */}
                        <SpeciesMark emoji={m.emoji} photo={photos.get(m.species)} />
                        {/* The name opens its year; the rest of the row opens
                            the editor. The life cycle used to hang off the
                            discovery chiclets, so it was reachable while
                            browsing and never for a creature already on the
                            roster — which is when a grower wants it. */}
                        <button
                          onClick={() => openHabits(m.species, m.scientific_name)}
                          title={`What USA-NPN tracks ${m.species} doing in a year`}
                          className="border-b border-dotted border-ink-soft/70 text-left">
                          {m.species}
                        </button>
                      </td>
                      {/* The event, not the creature, is what tells two rows
                          apart — a bird's arrival and its departure are two
                          things the grower chose to track. */}
                      <td onClick={open} className="cursor-text px-3 py-2.5">{m.event}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${clock.cls}`}>
                          {clock.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="data text-[11px] text-ink-soft">
                          {e ? (
                            <>
                              {e.threshold}
                              {when && ` → ${day(when)}${past ? "" : " expected"}`}
                              {e.window && !past && ` (${day(e.window.from)}–${day(e.window.to)})`}
                              {!when && " → not this season"}
                            </>
                          ) : "not yet read"}
                        </span>
                        {m.note && <p className="mt-0.5 text-[12px] text-ink-soft">{m.note}</p>}
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        <span className={`mr-2 shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                          past ? "bg-growth/12 text-growth" : "bg-band text-ink-soft"}`}>
                          {past ? "seen" : "ahead"}
                        </span>
                        <button onClick={() => {
                          remembered({
                            kind: "wildlife", blockId: region.id,
                            label: [m.species, m.event].filter(Boolean).join(" · "),
                            item: wildlifeCodec.to(m) as Record<string, unknown>,
                          });
                          void retireWildlife(m.id);
                        }}
                          aria-label={`Remove ${m.species} ${m.event}`}
                          className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={pages} total={total} noun="watch" onPage={setPageNo} />
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
            ? "Nothing matches that. Clear the search to see everything you track."
            : `Nothing tracked on ${region.name} yet. Take a creature from what is `
              + "recorded around you below — when do your robins arrive, when do the "
              + "squirrels start caching — and the calendar works out when it happens "
              + "on this ground."}
        </Empty>
      )}

      <EventComposer
        region={region}
        recorded={models}
        onSave={saveComposed}
        onCost={onCost}
        seed={seed}
        onSeedTaken={() => setSeed(null)} />

      {/* ── Sightings ───────────────────────────────────────────────────
          Four labelled rows of chiclets, each capped at 24, of 377 creatures
          recorded around one block — with no way to reach the rest. Scanning
          is what that was good at and searching is what fits the numbers. */}
      <Section emoji="🔭" title="Community Observations">
        <Provenance tool="goodearth_nearby_species" at={catAt} onCost={onCost} />
      </Section>

      <SpeciesFinder
        block={region.id}
        blockName={region.name}
        kingdom={kingdom}
        kingdoms={[
          { key: "wildlife", label: "🦌 Wildlife" },
          { key: "fungi", label: "🍄 Fungi" },
        ]}
        onKingdom={(k) => setKingdom(k as "wildlife" | "fungi")}
        adding={addingMany}
        hint="What people have actually seen near here. Choose any number, keep searching, then add them all. They go on the roster named and undated — the clock and its figure are yours to set."
        onAdd={addChosen}
      />

      {habitsOf && (
        <div className="mb-3 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <b className="figure text-[15px]">{habitsOf.name}</b>
                <span className="data text-[10.5px] text-ink-soft">
                  {habitsBusy ? "reading…" : habits?.tracked ? "tracked by USA-NPN" : "not tracked"}
                </span>
                <button onClick={() => { setHabitsOf(null); setHabits(null); }}
                  aria-label="Close" className="ml-auto inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-ink">×</button>
              </div>
              {habits && (habits.habits ?? []).length > 0 ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(habits.habits ?? []).map((h) => (
                      <span key={h}
                        className="rounded-full border border-rule bg-paper px-3.5 py-1.5 text-[12px]">
                        {h}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
                    What USA-NPN tracks this animal doing in a year. The composer
                    offers these as labels once you choose the animal; the clock
                    that says when it happens on your ground stays yours.
                  </p>
                </>
              ) : habits && !habitsBusy ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{habits.note}</p>
              ) : null}
        </div>
      )}
    </>
  );
}

/// One watch, open for editing.
///
/// Only the fields every clock shares are editable in the row — the creature,
/// its event, and the note. The thresholds differ per driver (a GDD figure, a
/// day length, a count of days, a date), and cramming four shapes into one row
/// would make the common edit — a misspelt species, a clearer event name —
/// worse in order to serve the rare one. Change a threshold by removing the
/// watch and adding it again from the form, which already asks the right
/// questions for each clock.
function Editor({ draft, onChange, onCommit, onCancel, saving }: {
  draft: SavedWildlife;
  onChange: (w: SavedWildlife) => void;
  onCommit: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = (patch: Partial<SavedWildlife>) => onChange({ ...draft, ...patch });
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onCommit(); }
    if (e.key === "Escape") onCancel();
  };
  return (
    <tr className="border-b border-rule bg-band/40 last:border-b-0">
      <td className="px-3 py-2 align-top">
        <input autoFocus value={draft.species} className={CELL} onKeyDown={keys}
          onChange={(e) => set({ species: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input value={draft.event} className={CELL} onKeyDown={keys}
          placeholder="first arrival"
          onChange={(e) => set({ event: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input value={draft.emoji ?? ""} className={CELL} onKeyDown={keys}
          placeholder="🐦" onChange={(e) => set({ emoji: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input value={draft.note ?? ""} className={CELL} onKeyDown={keys}
          placeholder="note" onChange={(e) => set({ note: e.target.value })} />
      </td>
      <td className="px-2 py-2 text-right align-top whitespace-nowrap">
        <RowActions onCommit={onCommit} onCancel={onCancel} saving={saving} what="watch" />
      </td>
    </tr>
  );
}
