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
import { wildlifeCalendar, type WildlifeResult } from "../lib/mcp";
import { useBlockItems, type ItemSort } from "../lib/blockItems";
import {
  DRIVER_HELP, HUSBANDRY_INTERVALS, makeWildlife,
  wildlifeCodec, type SavedWildlife,
} from "../lib/wildlifeModels";
import type { SavedRegion } from "../lib/regions";
import {
  CELL, Empty, ErrorBox, FIELD, ICON, IconButton, Note, PageTitle, Pill,
  RowActions, Section, SpeciesChiclet,
} from "../components/ui";
import { speciesHabits, wildlifeCatalog, type SpeciesHabitsResult, type WildlifeCatalogResult } from "../lib/mcp";

const CLOCK: Record<string, { label: string; cls: string }> = {
  heat:     { label: "heat",     cls: "bg-growth/12 text-growth" },
  daylight: { label: "daylight", cls: "bg-honey/15 text-honey" },
  interval: { label: "days from", cls: "bg-clay/12 text-clay" },
  calendar: { label: "your record", cls: "bg-band text-ink-soft" },
};

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

  const { items: models, save: storeWildlife, retire: retireWildlife,
          loading: modelsLoading, error: modelsError,
          unknownBlock: modelsUnknown, total, page, pages } =
    useBlockItems<SavedWildlife>(region.id, "wildlife", wildlifeCodec, undefined, {
      sortCol: sort, sortDir: dir, page: pageNo, search, pageSize: 20,
    });
  const [data, setData] = useState<WildlifeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [driver, setDriver] = useState<"heat" | "daylight" | "interval" | "calendar">("daylight");
  const [husbandryFrom, setHusbandryFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState<WildlifeCatalogResult | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [catAt, setCatAt] = useState<Date | null>(null);
  /// Tapping a species names it and leaves the clock blank. Which animals are
  /// here is a fact about the country; when they arrive on this farm is not.
  const [species, setSpecies] = useState("");
  /// The animal whose habits are open, and what USA-NPN tracks it doing.
  const [habitsOf, setHabitsOf] = useState<{ name: string } | null>(null);
  const [habits, setHabits] = useState<SpeciesHabitsResult | null>(null);
  const [habitsBusy, setHabitsBusy] = useState(false);
  /// Tapping a habit names the event; the clock that times it stays the
  /// grower's, exactly as the species name does.
  const [eventName, setEventName] = useState("");


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

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const made = makeWildlife({
      species: String(f.get("species") ?? ""),
      event: String(f.get("event") ?? ""),
      emoji: String(f.get("emoji") ?? "") || undefined,
      driver,
      ...(driver === "heat"
        ? { gdd: Number(f.get("gdd")), base_temp: Number(f.get("base") || 50) }
        : driver === "daylight"
          ? { daylight_hours: Number(f.get("hours")), rising: f.get("rising") === "up" }
          : driver === "interval"
            ? { days: Number(f.get("days")), from: String(f.get("from") ?? "") }
            : { typical_on: String(f.get("on") ?? "") }),
    }, region.id);
    if (typeof made === "string") { setError(made); return; }
    setError("");
    void storeWildlife(made);
    // A controlled field is not cleared by form.reset(), so a saved event
    // would otherwise sit in the box looking unsaved.
    setSpecies(""); setEventName("");
    e.currentTarget.reset();
  }

  const loadCatalog = useCallback(async () => {
    setCatBusy(true);
    try {
      const r = await wildlifeCatalog(region.id);
      if (r.success) { setCat(r); setCatAt(new Date()); }
      else setError(r.error || "The wildlife catalogue could not be read.");
    } finally { setCatBusy(false); }
  }, [region.id]);

  const openHabits = useCallback(async (common: string, sci?: string) => {
    setSpecies(common);
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

      {data && data.due_soon.length > 0 && (
        <div className="mb-5 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <span className="eyebrow">Watch for these</span>
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {data.due_soon.map((e) => (
              <li key={e.species + e.event}>
                {e.emoji} <b>{e.species}</b> — {e.event} in about {e.days_away} days
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3 flex items-center justify-end gap-1.5">
        <IconButton path={ICON.add} label="Watch" form="new-watch" title="Track something" />
      </div>

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
                  const clock = CLOCK[m.driver];
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
                        <span className="mr-1.5 text-[15px]" aria-hidden="true">{m.emoji || "•"}</span>
                        {m.species}
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
                        <button onClick={() => void retireWildlife(m.id)}
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
        <ErrorBox>This browser is set to ground the record does not have. Pick the block again from Favorites, or save it on the Map.</ErrorBox>
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

      {/* ── Add ────────────────────────────────────────────────────────── */}
      {/* Submitted from the icon button at the top of the page. This form asks
          different questions per clock, so it keeps its own block rather than
          being flattened into the header row. */}
      <Section emoji="➕" title="Track something" />
      <form id="new-watch" onSubmit={add} className="rounded-md border border-rule bg-panel p-4">
        <div className="flex flex-wrap gap-1.5">
          {(["daylight", "heat", "interval", "calendar"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDriver(d)}
              className={`min-h-11 rounded-full border px-4 text-[13px] font-medium ${
                driver === d ? "border-ink bg-ink text-paper" : "border-rule active:bg-band"}`}>
              {CLOCK[d].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-ink-soft">{DRIVER_HELP[driver]}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="species" label="Creature" placeholder="American robin"
            value={species} onChange={setSpecies} />
          <Field name="event" label="Event" placeholder="first arrival"
            value={eventName} onChange={setEventName} />
          <Field name="emoji" label="Emoji" placeholder="🐦" />
          {driver === "heat" && (
            <>
              <Field name="gdd" label="GDD" placeholder="120" />
              <Field name="base" label="Base °F" placeholder="43" />
            </>
          )}
          {driver === "daylight" && (
            <>
              <Field name="hours" label="Day length (h)" placeholder="11.5" />
              <label className="block text-[11px] text-ink-soft">
                Direction
                <select name="rising"
                  className={FIELD}>
                  <option value="up">days lengthening</option>
                  <option value="down">days shortening</option>
                </select>
              </label>
            </>
          )}
          {driver === "interval" && (
            <>
              <label className="block text-[11px] text-ink-soft">
                Counting from
                <input name="from" type="date"
                  className={FIELD} />
              </label>
              <Field name="days" label="Days" placeholder="147" />
            </>
          )}
          {driver === "calendar" && <Field name="on" label="Typical (MM-DD)" placeholder="09-15" />}
        </div>

      </form>

      <Section emoji="🐄" title="Livestock" />
      <div>
        <span className="eyebrow">Pick a date and it counts forward</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <label className="text-[11px] text-ink-soft">
            <input type="date" value={husbandryFrom}
              onChange={(e) => setHusbandryFrom(e.target.value)}
              className="min-h-11 rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" />
          </label>
          {HUSBANDRY_INTERVALS.map((h) => (
            <button key={h.species + h.event}
              onClick={() => {
                const made = makeWildlife({
                  species: h.species, event: h.event, driver: "interval",
                  days: h.days, from: husbandryFrom, emoji: h.emoji,
                }, region.id);
                if (typeof made === "string") setError(made);
                else void storeWildlife(made);
              }}
              title={`${h.days} days from ${h.from_label}`}
              className="data min-h-11 rounded-full border border-rule bg-panel px-3.5 text-[12px] text-ink-soft active:border-ink active:text-ink">
              {h.emoji} {h.species} · {h.event}
              <span className="ml-1.5 opacity-60">{h.days}d</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
          A ewe's gestation does not care what the season is doing — it is a
          count of days from the day she was bred, so these are arithmetic
          rather than weather. Set the date above, then tap. Figures are typical
          and breed-dependent; edit them to your own stock.
        </p>
      </div>

      <Section emoji="🔭" title="Sightings">
        {!cat && (
          <Pill onClick={loadCatalog} disabled={catBusy} active>
            {catBusy ? "🧠 Reading…" : "🧠 Who's here?"}
          </Pill>
        )}
        {cat && <Provenance tool="goodearth_wildlife_catalog" at={catAt} onCost={onCost} />}
      </Section>

      {cat ? (
        <>
          {(cat.groups ?? []).map((g) => (
            <div key={g.taxon} className="mb-3">
              <p className="eyebrow">{g.emoji} {g.group}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {g.species.slice(0, 24).map((sp) => (
                  <SpeciesChiclet key={sp.name} photo={sp.photo} emoji={g.emoji}
                    name={sp.name} figure={sp.observations.toLocaleString()}
                    marked={sp.has_habits}
                    title={`${sp.scientific_name ?? sp.name} — ${sp.observations.toLocaleString()} sightings near here.${sp.has_habits ? " Tap for what it does through the year." : " Tap to track it."}`}
                    onClick={() => openHabits(sp.name, sp.scientific_name)} />
                ))}
              </div>
            </div>
          ))}
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
                      <button key={h} onClick={() => setEventName(h)}
                        title={`Track "${h}" for ${habitsOf.name}`}
                        className="min-h-11 rounded-full border border-rule bg-paper px-3.5 text-[12px] active:border-ink">
                        {h}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
                    What USA-NPN tracks this animal doing in a year. Tap one to name it
                    above — the clock that says when it happens on your ground is yours.
                  </p>
                </>
              ) : habits && !habitsBusy ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{habits.note}</p>
              ) : null}
            </div>
          )}

          <Note>
            {cat.species_total} species within about {cat.search_span_km} km ·{" "}
            {cat.with_habits} with life-cycle data. Ranked by sightings.
            {(cat.unavailable ?? []).length > 0 && ` ${(cat.unavailable ?? []).join(" and ")} did not load.`}{" "}
            Timings are yours to set.
          </Note>
        </>
      ) : (
        <Note>Animals recorded around here, from iNaturalist.</Note>
      )}
    </>
  );
}

function Field({ name, label, placeholder, value, onChange }: {
  name: string; label: string; placeholder: string;
  value?: string; onChange?: (v: string) => void;
}) {
  return (
    <label className="block text-[11px] text-ink-soft">
      {label}
      <input name={name} placeholder={placeholder} className={FIELD}
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : {})} />
    </label>
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
