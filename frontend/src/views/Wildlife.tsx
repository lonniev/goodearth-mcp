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
import { wildlifeCalendar, type WildlifeResult } from "../lib/mcp";
import {
  deleteWildlife, DRIVER_HELP, HUSBANDRY_INTERVALS, listWildlife, makeWildlife,
  saveWildlife, type SavedWildlife,
} from "../lib/wildlifeModels";
import type { SavedRegion } from "../lib/regions";
import { Empty, ErrorBox, FIELD, Note, PageTitle, Pill, Section, SpeciesChiclet } from "../components/ui";
import { speciesHabits, wildlifeCatalog, type SpeciesHabitsResult, type WildlifeCatalogResult } from "../lib/mcp";

const CLOCK: Record<string, { label: string; cls: string }> = {
  heat:     { label: "heat",     cls: "bg-growth/12 text-growth" },
  daylight: { label: "daylight", cls: "bg-honey/15 text-honey" },
  interval: { label: "days from", cls: "bg-clay/12 text-clay" },
  calendar: { label: "your record", cls: "bg-band text-ink-soft" },
};

const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Wildlife({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  const [models, setModels] = useState<SavedWildlife[]>(() => listWildlife(region.id));
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

  useEffect(() => { setModels(listWildlife(region.id)); }, [region.id]);

  const run = useCallback(async (list: SavedWildlife[]) => {
    if (!list.length) { setData(null); return; }
    setBusy(true); setError("");
    try {
      const r = await wildlifeCalendar(
        region.region,
        list.map(({ id: _i, regionId: _r, ...e }) => e),
      );
      if (!r.success) { setError(r.error || "The calendar could not be read."); return; }
      setData(r); setRanAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(models); }, [run, models]);

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
    setModels(saveWildlife(made).filter((m) => m.regionId === region.id));
    // A controlled field is not cleared by form.reset(), so a saved event
    // would otherwise sit in the box looking unsaved.
    setSpecies(""); setEventName("");
    e.currentTarget.reset();
  }

  const loadCatalog = useCallback(async () => {
    setCatBusy(true);
    try {
      const r = await wildlifeCatalog(region.region);
      if (r.success) { setCat(r); setCatAt(new Date()); }
      else setError(r.error || "The wildlife catalogue could not be read.");
    } finally { setCatBusy(false); }
  }, [region.region]);

  const openHabits = useCallback(async (common: string, sci?: string) => {
    setSpecies(common);
    if (!sci) return;
    setHabitsOf({ name: common }); setHabits(null); setHabitsBusy(true);
    try {
      setHabits(await speciesHabits(region.region, sci));
    } finally { setHabitsBusy(false); }
  }, [region.region]);

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

      <Section emoji="📅" title="The year" first>
        {models.length > 0 && <Provenance tool="goodearth_wildlife_calendar" at={ranAt} onCost={onCost} />}
      </Section>
      {data?.summary && <p className="mb-2.5 text-[13px] text-ink-soft">{data.summary}</p>}

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel"><QuoteScroller heading="Reading the year" /></div>
      ) : data ? (
        <ul className="space-y-2">
          {data.events.map((e) => {
            const clock = CLOCK[e.driver];
            const when = e.reached_on ?? e.projected_date;
            const past = !!e.reached_on;
            const id = models.find((m) => m.species === e.species && m.event === e.event)?.id;
            return (
              <li key={e.species + e.event}
                className="flex items-start gap-3 rounded-md border border-rule bg-panel px-3.5 py-2.5">
                <span className="text-[22px] leading-none">{e.emoji || "•"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <b className="text-[13.5px]">{e.species}</b>
                    <span className="text-[13px] text-ink-soft">{e.event}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${clock.cls}`}>
                      {clock.label}
                    </span>
                  </div>
                  <div className="data mt-0.5 text-[11px] text-ink-soft">
                    {e.threshold}
                    {when && ` → ${day(when)}${past ? "" : " expected"}`}
                    {e.window && !past && ` (${day(e.window.from)}–${day(e.window.to)})`}
                    {!when && " → not this season"}
                  </div>
                  {e.note && <p className="mt-0.5 text-[12px] text-ink-soft">{e.note}</p>}
                </div>
                <span className={`shrink-0 self-center rounded-full px-2 py-1 text-[11px] font-semibold ${
                  past ? "bg-growth/12 text-growth" : "bg-band text-ink-soft"}`}>
                  {past ? "seen" : "ahead"}
                </span>
                {id && (
                  <button onClick={() => setModels(deleteWildlife(id).filter((m) => m.regionId === region.id))}
                    aria-label={`Remove ${e.species}`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>
          Nothing tracked on {region.name} yet. Take a creature from what is
          recorded around you below — when do your robins arrive, when do the
          squirrels start caching — and the calendar works out when it happens
          on this ground.
        </Empty>
      )}

      {/* ── Add ────────────────────────────────────────────────────────── */}
      <Section emoji="➕" title="Track something" />
      <form onSubmit={add} className="rounded-md border border-rule bg-panel p-4">
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

        <button className="mt-3 min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
          Track it
        </button>
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
                else setModels(saveWildlife(made).filter((m) => m.regionId === region.id));
              }}
              title={`${h.days} days from ${h.from_label}`}
              className="data min-h-11 rounded-full border border-rule bg-panel px-3.5 text-[12px] text-ink-soft active:border-ink active:text-ink">
              {h.emoji} {h.species} · {h.event}
              <span className="ml-1.5 opacity-60">{h.days}d</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 max-w-prose text-[12px] leading-relaxed text-ink-soft">
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
            {cat.species_total} species recorded within about {cat.search_span_km} km,
            {" "}{cat.with_habits} of them with life-cycle data. Ranked
            by how often each has been seen — which measures where people walk as much as
            where animals live. Species are a landscape fact and one field holds almost no
            records, which is why this looks wider than your ground.
            {(cat.unavailable ?? []).length > 0 && ` ${(cat.unavailable ?? []).join(" and ")} did not load, so that group is missing rather than empty.`}
            {" "}Tapping one names the animal and nothing else: when it arrives on your
            ground is yours to set, and Good Earth does not publish natural history.
          </Note>
        </>
      ) : (
        <Note>
          Which animals are actually recorded around here, from iNaturalist — owls, bats,
          coyotes and the rest of what you hear at dusk, rather than a handful of species
          written into this app. What comes back is a name and how often it has been seen;
          the threshold that times it stays yours.
        </Note>
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
