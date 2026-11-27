// Track something — picked, not typed.
//
// The form this replaces asked a grower to type the creature's name, and to
// type `typical_on` as "MM-DD". Both are things the service already knows or
// can offer: iNaturalist has the animals recorded around this ground and a
// search for every animal that is not, the grower's own record has the flock
// in the barn, and a month and a day are two short lists. A typed date invites "Sept 5", "9/5" and "05-09", and only one
// of those is what the record wanted.
//
// Two places still take free text and they are the two the brief allows: an
// animal that is in no source, and the short label for what it does. Both are
// the grower's own words about their own ground, which no list can supply.
//
// The five clocks are here, including `condition`, which the server has always
// taken and the form has never offered.

import { isoDay } from "../lib/zone";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  almanacFor, gddSeasonCurve, speciesHabits, wildlifeCalendar, wildlifeCatalog,
  type AlmanacResult, type MoonPhase, type SeasonCurveResult, type WildlifeCatalogResult,
  type WildlifeEventInput, type WildlifeResult,
} from "../lib/mcp";
import {
  cycleRows, filterSpecies, labelsUsed, lastInterval, listed, mergeSpecies,
  withFound, type CycleDraft, type Milestone, type Pick,
} from "../lib/husbandry";
import { searchSpecies, type SpeciesHit } from "../lib/species";
import { makeWildlife, DRIVER_HELP, type SavedWildlife } from "../lib/wildlifeModels";
import type { SavedRegion } from "../lib/regions";
import Provenance from "./Provenance";
import LifeCycleStory from "./LifeCycleStory";
import { trackedFor, wildlifeRows } from "../lib/lifeCycle";
import { useSubmit } from "../lib/useSubmit";
import { useUnits } from "./Units";
import {
  ErrorBox, Field, FIELD, ICON, IconButton, LifecycleMark, MonthDay, Note, Pill,
  SpeciesMark, Stepper, TrashGlyph,
} from "./ui";
import { tour } from "../lib/tour/targets";
import { useT, WORDS, type Translate } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { Tx, useLanguageLocale } from "@tollbooth-dpyc/web/react";

type Driver = "calendar" | "interval" | "daylight" | "heat" | "condition" | "moon";

const CLOCKS: { key: Driver; label: MessageKey }[] = [
  { key: "interval", label: "ui.eventComposer.clock.interval" },
  { key: "calendar", label: "ui.eventComposer.clock.calendar" },
  { key: "daylight", label: "ui.eventComposer.clock.daylight" },
  { key: "heat", label: "ui.eventComposer.clock.heat" },
  { key: "condition", label: "ui.eventComposer.clock.condition" },
  { key: "moon", label: "ui.eventComposer.clock.moon" },
];

const PHASE_PILLS: { key: MoonPhase; glyph: string; label: MessageKey }[] = [
  { key: "new", glyph: "🌑", label: "ui.eventComposer.phase.new" },
  { key: "first_quarter", glyph: "🌓", label: "ui.eventComposer.phase.firstQuarter" },
  { key: "full", glyph: "🌕", label: "ui.eventComposer.phase.full" },
  { key: "last_quarter", glyph: "🌗", label: "ui.eventComposer.phase.lastQuarter" },
];
const NTH = [1, 2, 3] as const;
const NTH_LABEL: Record<number, MessageKey> = {
  1: "ui.eventComposer.nth.first", 2: "ui.eventComposer.nth.second", 3: "ui.eventComposer.nth.third",
};

/// What each clock means, in the language on screen.
const help = (t: Translate, d: Driver): string =>
  d === "interval" ? t("ui.eventComposer.help.interval")
  : d === "condition" ? t("ui.eventComposer.help.condition")
  : (DRIVER_HELP as Record<Driver, string>)[d];

/// The grower's role for an animal: the value stored, and its words.
const ROLE_LABEL: Record<"friend" | "foe" | "watch", MessageKey> = {
  friend: "ui.eventComposer.role.friend",
  foe: "ui.eventComposer.role.foe",
  watch: "ui.eventComposer.role.watch",
};

/// The same pause `SpeciesPicker` takes before it searches.
const SEARCH_DEBOUNCE_MS = 250;

const today = () => isoDay();
const dayIn = (iso: string, locale: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" });

export default function EventComposer({
  region, recorded, photos, onSave, onCost, seed, onSeedTaken, composing, onComposing,
}: {
  region: SavedRegion;
  recorded: SavedWildlife[];
  /// The page's photograph for each creature on the record, by saved name. The
  /// table above this form already shows them; a hen that is a picture there
  /// should not be a placeholder here.
  photos?: Map<string, string>;
  /// `supersedes` names the rows this cycle replaces — the previous brood,
  /// when the grower started another. Empty for anything entered from scratch.
  onSave: (rows: SavedWildlife[], supersedes: string[]) => Promise<void>;
  onCost: (sats: number) => void;
  /// A cycle handed in from the record — "start another brood". It arrives
  /// filled in, so the grower's only remaining decision is the day.
  seed?: (CycleDraft & { supersedes?: string[] }) | null;
  onSeedTaken?: () => void;
  /// Whether the panel with the clock and its figures is open. The page holds
  /// it, so the guided tour can open it before pointing inside.
  composing: boolean;
  onComposing: (open: boolean) => void;
}) {
  const u = useUnits();
  const t = useT();
  const locale = useLanguageLocale();
  const day = (iso: string) => dayIn(iso, locale);
  const [error, setError] = useState("");
  const submit = useSubmit("wl", setError);

  // ── The animal ─────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<WildlifeCatalogResult | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [catAsked, setCatAsked] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [animal, setAnimal] = useState<Pick | null>(null);
  /// Rows the cycle being composed will replace. Held here rather than in the
  /// page so it cannot outlive the draft it belongs to: a grower who seeds a
  /// second brood, changes their mind and records something else entirely must
  /// not have the first brood retired out from under them.
  const [supersedes, setSupersedes] = useState<string[]>([]);
  /// What this animal already has on the record, so its story ticks and fixes those.
  const trackedHere = useMemo(
    () => (animal ? trackedFor(recorded, animal.name) : new Set<string>()), [recorded, animal]);

  /// Asked for once, and only when the grower goes looking. A catalogue read
  /// costs a fare, and a page visit that never touches this panel should not.
  const askCatalog = useCallback(async () => {
    if (catAsked) return;
    setCatAsked(true); setCatBusy(true);
    try {
      const r = await wildlifeCatalog(region.id);
      if (r.success) setCatalog(r);
      else setError(r.error || t("ui.eventComposer.catalogFailed"));
    } catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setCatBusy(false); }
  }, [catAsked, region.id, t]);

  /// What iNaturalist's whole catalogue of animals has for the words typed.
  ///
  /// The list used to be only the neighbourhood's sightings, narrowed. Nobody
  /// reports a laying flock, so "chicken" narrowed 377 creatures down to two
  /// mushrooms. The search costs no fare: it is iNaturalist's public API,
  /// asked from the browser, the way the plant and pest pickers ask it.
  const [found, setFound] = useState<SpeciesHit[]>([]);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setFound([]); setFinding(false); setFindError(""); return; }
    const ac = new AbortController();
    setFinding(true);
    const timer = setTimeout(() => {
      searchSpecies(text, "animals", ac.signal)
        .then((r) => { if (!ac.signal.aborted) { setFound(r); setFindError(""); } })
        .catch((e) => {
          if (ac.signal.aborted) return;
          // Said, not swallowed: an empty answer would read as "no such
          // animal", which is a different claim from "could not ask".
          setFound([]);
          setFindError(String((e as Error).message ?? e));
        })
        .finally(() => { if (!ac.signal.aborted) setFinding(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { ac.abort(); clearTimeout(timer); };
  }, [q]);

  const all = useMemo(() => mergeSpecies(catalog, recorded), [catalog, recorded]);
  const shown = useMemo(
    () => withFound(filterSpecies(all, q).slice(0, 40), found),
    [all, q, found]);

  // ── What it does ───────────────────────────────────────────────────────
  const [driver, setDriver] = useState<Driver>("interval");
  const [role, setRole] = useState("");
  const [label, setLabel] = useState("");
  const mine = useMemo(() => labelsUsed(recorded), [recorded]);

  /// What USA-NPN publishes this animal doing in a year. A second source of
  /// labels, and the only one that knows anything before the grower does.
  const [habits, setHabits] = useState<string[]>([]);
  useEffect(() => {
    const sci = animal?.scientificName;
    if (!sci || !animal?.hasHabits) { setHabits([]); return; }
    let live = true;
    void speciesHabits(region.id, sci)
      .then((r) => { if (live) setHabits(r.habits ?? []); })
      .catch(() => { if (live) setHabits([]); });
    return () => { live = false; };
  }, [animal?.scientificName, animal?.hasHabits, region.id]);

  // ── The cycle, and the four other clocks ───────────────────────────────
  const [startOn, setStartOn] = useState(today);
  /// The interval clock starts with one milestone already there.
  ///
  /// It is what this clock is FOR — a day, and something counted from it — and
  /// making the grower press "+ a milestone" to reach the only reason they
  /// chose this clock is a tap that asks nothing. They can delete it: a date
  /// on its own is a real thing to record.
  const [steps, setSteps] = useState<Milestone[]>([{ label: "", days: 1 }]);
  const [typicalOn, setTypicalOn] = useState("");
  const [hours, setHours] = useState<number | "">(12);
  const [rising, setRising] = useState(true);
  const [gdd, setGdd] = useState<number | "">(100);
  const [base, setBase] = useState<number | "">(() => Math.round(u.temp(region.baseTempF)));
  const [after, setAfter] = useState("");
  const [minNight, setMinNight] = useState<number | "">("");
  const [minDay, setMinDay] = useState<number | "">("");
  const [wet, setWet] = useState(true);
  const [phase, setPhase] = useState<MoonPhase>("full");
  const [nth, setNth] = useState<1 | 2 | 3>(1);

  /// A cycle handed in from the record arrives complete. Nothing is invented:
  /// every figure came off rows the grower already saved.
  useEffect(() => {
    if (!seed) return;
    setDriver("interval");
    setAnimal({ name: seed.species, scientificName: seed.scientificName, yours: true });
    setLabel(seed.startLabel);
    setStartOn(seed.startOn);
    setSteps(seed.steps);
    setSupersedes(seed.supersedes ?? []);
    onComposing(true);
    onSeedTaken?.();
  }, [seed, onSeedTaken, onComposing]);

  // Escape closes, and focus moves in — a modal a keyboard cannot leave is a trap.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!composing) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onComposing(false); };
    document.addEventListener("keydown", key);
    box.current?.focus();
    return () => document.removeEventListener("keydown", key);
  }, [composing, onComposing]);

  /// The count this grower used last for this animal. Not a fact about hens —
  /// a fact about THEIR hens, which is the only kind kept here.
  const remembered = animal ? lastInterval(recorded, animal.name) : undefined;

  /// Choosing the animal fills in the count they used last for it — but only
  /// into a milestone they have not touched. A grower who typed 19 for this
  /// clutch means 19, and last season's 21 must not land on top of it.
  useEffect(() => {
    if (remembered == null) return;
    setSteps((cur) => cur.length === 1 && !cur[0].label.trim() && cur[0].days === 1
      ? [{ label: "", days: remembered }] : cur);
  }, [remembered]);

  const draft: CycleDraft = {
    species: animal?.name ?? "",
    scientificName: animal?.scientificName,
    emoji: animal?.emoji,
    startLabel: label,
    startOn,
    steps,
    ...(role ? { role } : {}),
  };

  /// The rows this composer would write, or the grower's own words on the
  /// first thing that will not validate.
  const rows: SavedWildlife[] | string = useMemo(() => {
    if (driver === "interval") return cycleRows(draft, region.id);
    const shared = {
      species: animal?.name ?? "", event: label,
      ...(animal?.emoji ? { emoji: animal.emoji } : {}),
      ...(role ? { role } : {}),
    };
    const made = makeWildlife({
      ...shared,
      ...(driver === "calendar" ? { driver, typical_on: typicalOn }
        : driver === "daylight" ? { driver, daylight_hours: Number(hours), rising }
        : driver === "heat"
          ? { driver, gdd: u.ddToF(Number(gdd)),
              base_temp: base === "" ? region.baseTempF : u.toF(Number(base)) }
        : driver === "moon"
          ? { driver, phase, nth, ...(after ? { after } : {}) }
          : { driver,
              trigger: {
                ...(after ? { after } : {}),
                ...(minNight === "" ? {} : { min_night_f: u.toF(Number(minNight)) }),
                ...(minDay === "" ? {} : { min_day_f: u.toF(Number(minDay)) }),
                ...(wet ? { wet: true } : {}),
              } }),
    } as WildlifeEventInput, region.id);
    if (typeof made === "string") return made;
    return [{
      ...made,
      ...(animal?.scientificName ? { scientific_name: animal.scientificName } : {}),
    }];
    // `draft` is rebuilt every render; its parts are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, animal, label, role, startOn, steps, typicalOn, hours, rising,
      gdd, base, after, minNight, minDay, wet, phase, nth, region.id]);

  const ready = typeof rows !== "string";
  /// Nothing to say: the species is the first field and it is visibly empty.
  const obvious = !ready && !animal;

  // ── What the service says the dates are ────────────────────────────────
  //
  // The projection is the SERVICE's, not this browser's. Recomputing 21 days
  // from a date here would be easy and would be a second implementation of the
  // thing being previewed — and the window, which is where the honesty lives,
  // comes from the server's own ±2%.
  const [preview, setPreview] = useState<WildlifeResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewAt, setPreviewAt] = useState<Date | null>(null);
  const signature = ready ? JSON.stringify(rows) : "";
  const previewed = useRef("");

  useEffect(() => {
    if (!signature || signature === previewed.current) return;
    // A read costs a fare, so it waits for the grower to stop moving. Dragging
    // the daylight slider is one call when they let go, not one per pixel.
    const timer = setTimeout(() => {
      previewed.current = signature;
      setPreviewBusy(true);
      const list = (JSON.parse(signature) as SavedWildlife[])
        .map(({ id, regionId: _r, ...e }) => ({ ...e, ref: id }));
      void wildlifeCalendar(region.id, list as WildlifeEventInput[])
        .then((r) => {
          if (previewed.current !== signature) return;
          if (r.success) { setPreview(r); setPreviewAt(new Date()); }
          else setError(r.error || t("ui.eventComposer.datesFailed"));
        })
        .catch((e) => setError(String((e as Error).message ?? e)))
        .finally(() => setPreviewBusy(false));
    }, 900);
    return () => clearTimeout(timer);
  }, [signature, region.id, t]);

  const stale = ready && signature !== previewed.current;

  // ── The curves the sliders sit on ──────────────────────────────────────
  const [sky, setSky] = useState<AlmanacResult | null>(null);
  const [curve, setCurve] = useState<SeasonCurveResult | null>(null);
  useEffect(() => {
    if (driver !== "daylight" || sky) return;
    void almanacFor(region.id).then((r) => { if (r.success) setSky(r); }).catch(() => {});
  }, [driver, sky, region.id]);
  useEffect(() => {
    if (driver !== "heat" || curve) return;
    void gddSeasonCurve(region.id, region.baseTempF)
      .then((r) => { if (r.success) setCurve(r); }).catch(() => {});
  }, [driver, curve, region.id, region.baseTempF]);

  /// The block's own day length through the season, so the slider is set
  /// against this ground rather than against an abstract 0–24.
  const daylight = useMemo(() => {
    const series = [...(sky?.measures?.daylight?.actual ?? []),
                    ...(sky?.measures?.daylight?.forecast ?? [])]
      .filter((n): n is number => n != null);
    if (!series.length) return null;
    return { low: Math.min(...series), high: Math.max(...series) };
  }, [sky]);

  function reset() {
    setAnimal(null); setQ(""); setLabel(""); setSteps([{ label: "", days: 1 }]);
    setStartOn(today()); setTypicalOn("");
    setSupersedes([]);
    setPreview(null); previewed.current = "";
  }

  return (
    <>
      {error && <ErrorBox>{error}</ErrorBox>}

      {/* The Pests card's shape: one row, every caption on one line, and the
          act at the end. The species and what it does are all a glance needs;
          the clock, its figures and the dates they fall on open in a panel
          over the page, because they were a screen of their own stacked
          above the year. */}
      <div id="track-something" className="mb-4 rounded-md border border-rule bg-panel p-4">
          <datalist id="goodearth-labels">
            {[...new Set([...habits, ...mine])].map((h) => <option key={h} value={h} />)}
          </datalist>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2.5">
          {/* What is SEARCHED for here is animals. Fungi are named on Flora;
              a row already on this record shows whatever it is. */}
          <Field label={t("ui.eventComposer.species")} htmlFor="wl-species" width="min-w-[15rem] flex-1" tour="wildlife.species">
            <input id="wl-species"
              value={animal ? animal.name : q}
              onFocus={() => { setOpen(true); void askCatalog(); }}
              onChange={(e) => { setAnimal(null); setQ(e.target.value); setOpen(true); }}
              placeholder={t("ui.eventComposer.speciesPlaceholder")}
              className={FIELD} />
            {open && !animal && (
              <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-rule bg-paper">
                {catBusy && <p className="px-3 py-2 text-[0.75rem] text-ink-soft">{t("ui.eventComposer.readingCatalog")}</p>}
                {shown.map((p) => (
                  <button key={p.name} type="button"
                    onClick={() => { setAnimal(p); setSupersedes([]); setOpen(false); setQ(""); }}
                    className="flex w-full items-center gap-2.5 border-b border-rule px-2.5 py-2 text-left last:border-b-0 active:bg-band">
                    <SpeciesMark emoji={p.emoji} photo={p.photo ?? photos?.get(p.name)} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <b className="block truncate text-[0.8125rem]">{p.name}</b>
                      {p.scientificName && (
                        <i className="block truncate text-[0.6875rem] text-ink-soft">{p.scientificName}</i>
                      )}
                      {/* Why a red-tailed hawk answers "chicken": the name that
                          matched, when it is not one already on the row. */}
                      {p.matched
                        && !`${p.name} ${p.scientificName ?? ""}`.toLowerCase()
                          .includes(p.matched.toLowerCase()) && (
                        <span className="data block truncate text-[0.65625rem] text-ink-soft">
                          {t("ui.eventComposer.matched", { name: p.matched })}
                        </span>
                      )}
                    </span>
                    <span className="data shrink-0 text-right text-[0.65625rem] text-ink-soft">
                      {/* Something the grower already tracks has no sighting
                          count of its own — nobody submits observations of a
                          laying flock — and "0 nearby" about it would be
                          arithmetic dressed up as a fact. It used to read "yours",
                          which named the owner and not the reason. */}
                      {/* An animal the search found has no count either: how many
                          the world has recorded is not how many are near here. */}
                      {p.yours
                        ? <span className="text-growth">{t("ui.eventComposer.onYourRecord")}</span>
                        : p.observations != null && p.observations.toLocaleString(locale)}
                      {p.hasHabits && <span className="block"><LifecycleMark /></span>}
                    </span>
                  </button>
                ))}
                {finding && !shown.length && (
                  <p className="px-3 py-2 text-[0.75rem] text-ink-soft">{t("ui.eventComposer.looking")}</p>
                )}
                {findError && (
                  <p className="px-3 py-2 text-[0.75rem] text-clay">
                    {t("ui.eventComposer.searchFailed", { error: findError })}
                  </p>
                )}
                {!catBusy && !finding && !listed(shown, q) && (
                  <button type="button"
                    onClick={() => { setAnimal({ name: q.trim() }); setOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-[0.8125rem]">
                    {/* The escape hatch, and it stays open under a full list. A
                        search of everything finds something for nearly any word,
                        and a grower whose flock is "Layers" must not have to pick
                        somebody else's bird to get past it. */}
                    {!shown.length && t("ui.eventComposer.nothingListed")}<Tx ns={WORDS} k="ui.eventComposer.addOwn" vars={{ name: q.trim() }} components={{ b: <b /> }} />
                  </button>
                )}
                {!catBusy && !finding && !shown.length && !q.trim() && (
                  <p className="px-3 py-2 text-[0.75rem] text-ink-soft">
                    {t("ui.eventComposer.typeToSearch")}
                  </p>
                )}
              </div>
            )}
          </Field>
          <Field label={driver === "interval" ? t("ui.eventComposer.whatYouSaw") : t("ui.eventComposer.whatItDoes")} htmlFor="wl-label"
            width="min-w-[12rem] flex-1" tour="wildlife.label">
            <input id="wl-label" value={label} list="goodearth-labels"
              onChange={(e) => setLabel(e.target.value)}
              placeholder={driver === "interval" ? t("ui.eventComposer.sawPlaceholder") : t("ui.eventComposer.doesPlaceholder")}
              className={FIELD} />
          </Field>
          <span className="pt-3.5">
            <IconButton path={ICON.paw} label={t("ui.eventComposer.track")} hideLabel tour="wildlife.open"
              title={t("ui.eventComposer.trackTitle")} onClick={() => onComposing(true)} />
          </span>
        </div>
        {/* Its year, looked up: tick what to watch for and save it in one go.
            The clock above stays for anything the lookup does not have. */}
        {animal && !composing && (
          <LifeCycleStory region={region} subject="animal"
            who={{ scientificName: animal.scientificName, commonName: animal.name }}
            tracked={trackedHere} onCost={onCost}
            onTrack={async (chosen) => {
              await onSave(wildlifeRows(animal.name, chosen, region.id,
                { scientificName: animal.scientificName, emoji: animal.emoji }), []);
              reset();
            }} />
        )}
      </div>

      {composing && (
        <div
          className="fixed inset-0 z-[900] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
          onClick={() => onComposing(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("ui.eventComposer.trackIt")}
        >
          <div
            ref={box}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-t-xl border border-rule bg-panel p-5 shadow-xl outline-none sm:rounded-xl"
          >
            <div className="flex items-start gap-3">
              {animal && <SpeciesMark emoji={animal.emoji} photo={animal.photo ?? photos?.get(animal.name)} />}
              <h2 className="figure min-w-0 flex-1 text-[1.25rem] font-semibold leading-tight">
                {animal?.name || t("ui.eventComposer.whichAnimal")}
                {label.trim() && <span className="text-ink-soft"> · {label.trim()}</span>}
              </h2>
              <button type="button" onClick={() => onComposing(false)} aria-label={t("ui.eventComposer.close")}
                className="-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded text-[1.25rem] text-ink-soft active:bg-band">
                ×
              </button>
            </div>
            {animal && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5" {...tour("wildlife.role")}>
                {(["friend", "foe", "watch"] as const).map((r) => (
                  <Pill key={r} active={role === r} onClick={() => setRole(role === r ? "" : r)}>
                    {t(ROLE_LABEL[r])}
                  </Pill>
                ))}
                <button type="button" onClick={reset}
                  className="ml-auto min-h-11 text-[0.75rem] text-ink-soft underline">
                  {t("ui.eventComposer.startOver")}
                </button>
              </div>
            )}

            {(habits.length > 0 || mine.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[...new Set([...habits, ...mine])].slice(0, 12).map((h) => (
                  <button key={h} type="button" onClick={() => setLabel(h)}
                    className="min-h-11 rounded-full border border-rule bg-paper px-3.5 text-[0.75rem] active:border-ink">
                    {h}
                  </button>
                ))}
              </div>
            )}

            {/* ── The clock ──────────────────────────────────────────────── */}
            <div className="mt-3 flex flex-wrap gap-1.5" {...tour("wildlife.clock")}>
              {CLOCKS.map((c) => (
                <Pill key={c.key} active={driver === c.key}
                  onClick={() => {
                    setDriver(c.key); setSupersedes([]);
                    if (c.key === "interval" && !steps.length) setSteps([{ label: "", days: 1 }]);
                  }}>
                  {t(c.label)}
                </Pill>
              ))}
            </div>
            <p className="mt-1.5 text-[0.75rem] text-ink-soft">{help(t, driver)}</p>

            {/* ── The clock's own question ───────────────────────────────── */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2" {...tour("wildlife.figures")}>
              {driver === "interval" && (
                <>
                  <label className="block text-[0.6875rem] text-ink-soft">
                    {t("ui.eventComposer.dayItHappened")}
                    <input type="date" value={startOn} max={today()}
                      onChange={(e) => setStartOn(e.target.value)} className={FIELD} />
                  </label>
                  <div className="sm:col-span-2">
                    <span className="eyebrow">{t("ui.eventComposer.andThen")}</span>
                    {steps.map((s, i) => (
                      <div key={i} className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <label className="block text-[0.6875rem] text-ink-soft">
                          {t("ui.eventComposer.whatFollows")}
                          <input value={s.label} placeholder={t("ui.eventComposer.followsPlaceholder")} className={FIELD}
                            list="goodearth-labels"
                            onChange={(e) => setSteps(steps.map((x, j) =>
                              j === i ? { ...x, label: e.target.value } : x))} />
                        </label>
                        {/* The count and the way to be rid of it, on one line. On a
                            phone this row stacks, and a lone × under the stepper
                            read as a stray character rather than as this
                            milestone's control. */}
                        <div className="flex items-end gap-1">
                          <div className="w-36 shrink-0">
                            <Stepper label={t("ui.eventComposer.days")} value={s.days} min={1} max={1000}
                              onChange={(n) => setSteps(steps.map((x, j) =>
                                j === i ? { ...x, days: typeof n === "number" ? n : 0 } : x))} />
                          </div>
                          <button type="button" aria-label={t("ui.eventComposer.remove", { what: s.label || t("ui.eventComposer.milestone") })}
                            onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-soft active:text-clay"><TrashGlyph /></button>
                        </div>
                      </div>
                    ))}
                    <div className="mt-1.5">
                      <Pill onClick={() => setSteps([...steps,
                        // The count they used last for this animal, when there is
                        // one. Never a shipped figure: a hen is 21 days and a
                        // muscovy is 35, and both move with the breed.
                        { label: "", days: remembered ?? 1 }])}>
                        {t("ui.eventComposer.addMilestone")}{remembered ? t("ui.eventComposer.asYouHadIt", { n: remembered }) : ""}
                      </Pill>
                    </div>
                  </div>
                </>
              )}

              {driver === "calendar" && (
                <MonthDay label={t("ui.eventComposer.typicallyOn")} value={typicalOn} onChange={setTypicalOn} />
              )}

              {driver === "daylight" && (
                <>
                  <label className="block text-[0.6875rem] text-ink-soft sm:col-span-2">
                    {t("ui.eventComposer.dayLength", { h: typeof hours === "number" ? hours.toFixed(1) : "—" })}
                    <input type="range" min={daylight ? Math.floor(daylight.low * 10) / 10 : 8}
                      max={daylight ? Math.ceil(daylight.high * 10) / 10 : 16}
                      step={0.1} value={hours === "" ? 12 : hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                      className="mt-1.5 w-full accent-honey" />
                    <span className="data mt-0.5 block text-[0.65625rem] text-ink-soft">
                      {daylight
                        ? t("ui.eventComposer.daylightRange", { name: region.name, low: daylight.low.toFixed(1), high: daylight.high.toFixed(1) })
                        : t("ui.eventComposer.readingDaylight")}
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill active={rising} onClick={() => setRising(true)}>{t("ui.eventComposer.lengthening")}</Pill>
                    <Pill active={!rising} onClick={() => setRising(false)}>{t("ui.eventComposer.shortening")}</Pill>
                  </div>
                </>
              )}

              {driver === "heat" && (
                <>
                  <Stepper label={u.ddUnit.trim()} value={gdd} min={1} max={20000} step={25}
                    onChange={setGdd} />
                  <Stepper label={t("ui.eventComposer.base", { unit: u.tempUnit })} value={base} min={Math.round(u.temp(20))}
                    max={Math.round(u.temp(80))} onChange={setBase} />
                  <p className="data text-[0.6875rem] text-ink-soft sm:col-span-2">
                    {curve?.accumulated_gdd
                      ? t("ui.eventComposer.seasonSoFar", {
                          name: region.name,
                          n: Math.round(u.degreeDays(curve.accumulated_gdd.mean)).toLocaleString(locale),
                          unit: u.ddUnit.trim(),
                        })
                      : t("ui.eventComposer.readingSeason")}
                  </p>
                </>
              )}

              {driver === "condition" && (
                <>
                  <MonthDay label={t("ui.eventComposer.notBefore")} value={after} onChange={setAfter} />
                  <Stepper label={t("ui.eventComposer.nightAtOrAbove", { unit: u.tempUnit })} value={minNight}
                    min={Math.round(u.temp(20))} max={Math.round(u.temp(80))}
                    onChange={setMinNight} />
                  <Stepper label={t("ui.eventComposer.dayAtOrAbove", { unit: u.tempUnit })} value={minDay}
                    min={Math.round(u.temp(20))} max={Math.round(u.temp(80))}
                    onChange={setMinDay} />
                  <div className="flex items-end">
                    <Pill active={wet} onClick={() => setWet(!wet)}>{t("ui.eventComposer.rained")}</Pill>
                  </div>
                </>
              )}

              {driver === "moon" && (
                <>
                  <div className="flex flex-wrap items-end gap-1.5">
                    {NTH.map((n) => (
                      <Pill key={n} active={nth === n} onClick={() => setNth(n)}>{t(NTH_LABEL[n])}</Pill>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-1.5">
                    {PHASE_PILLS.map((p) => (
                      <Pill key={p.key} active={phase === p.key} onClick={() => setPhase(p.key)}
                        title={t("ui.eventComposer.phaseMoon", { phase: t(p.label) })}>
                        {p.glyph} {t(p.label)}
                      </Pill>
                    ))}
                  </div>
                  <MonthDay label={t("ui.eventComposer.onOrAfter")} value={after} onChange={setAfter} />
                </>
              )}
            </div>

            {/* ── What the service makes of it ───────────────────────────── */}
            {/*
              * No panel, and no reserved space for one.
              *
              * This was a bordered box with a "BEFORE YOU SAVE" eyebrow, and what
              * it usually held was "Which animal?" — a warning frame around the
              * observation that a form you have not filled in is not filled in. Of
              * course it is not. A disabled button already says so.
              *
              * The DATES are the part worth showing, and they only exist once the
              * draft is valid, so they render then and take no room before.
              */}
            {ready && (previewBusy || (preview && !stale)) && (
              <div className="mt-3 text-[0.8125rem]">
                {previewBusy ? (
                  <p className="text-[0.78125rem] text-ink-soft">{t("ui.eventComposer.workingOut")}</p>
                ) : (
                  <ul className="space-y-1">
                    {preview!.events.map((e) => {
                      const when = e.reached_on ?? e.projected_date;
                      return (
                        <li key={e.ref ?? e.event}>
                          <b>{e.event}</b>{" — "}
                          {when ? day(when) : t("ui.eventComposer.notThisSeason")}
                          {e.window && (
                            <span className="data text-[0.6875rem] text-ink-soft">
                              {" "}({day(e.window.from)}–{day(e.window.to)})
                            </span>
                          )}
                          {e.days_away != null && (
                            <span className="data text-[0.6875rem] text-ink-soft">{t("ui.eventComposer.inDays", { n: e.days_away })}</span>
                          )}
                        </li>
                      );
                    })}
                    {preview!.events.length === 0 && (
                      <li className="text-[0.78125rem] text-ink-soft">
                        {t("ui.eventComposer.nothingToDate")}
                      </li>
                    )}
                  </ul>
                )}
                {previewAt && !stale && (
                  <>
                    <p className="data mt-1 text-[0.65625rem] text-ink-soft">
                      {t("ui.eventComposer.workedOut")}
                    </p>
                    {/* The preview is a paid read like any other, so it says so and
                        says what it cost. A figure that appears for free invites the
                        grower to lean on it without knowing they are spending. */}
                    <Provenance tool="goodearth_wildlife_calendar" at={previewAt} onCost={onCost} />
                  </>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* `+ Record`, like every other editor on the site. "Record 2 events"
                  counted the rows in a sentence on the button; the count is beside
                  it, where a count belongs. */}
              <IconButton path={ICON.add} label={t("ui.eventComposer.record")} tour="wildlife.record"
                disabled={!ready || submit.busy}
                onClick={() => {
                  if (typeof rows === "string") { setError(rows); return; }
                  setError("");
                  // One write for the whole cycle: one fare, and no chance of a
                  // hatch date saved against a start that is not there.
                  submit.run(async () => { await onSave(rows, supersedes); reset(); onComposing(false); });
                }} />
              {/* The reason it is disabled — except the one that is already on
                  screen. An empty first field does not need a sentence asking for
                  it; the field is right there, blank, and the button is grey. The
                  messages worth showing are the ones a glance does not answer: a
                  count that will not parse, a day that is not a day. */}
              {!ready && !obvious && (
                <span className="text-[0.75rem] text-ink-soft">{rows as string}</span>
              )}
              {supersedes.length > 0 && (
                <span className="data text-[0.6875rem] text-ink-soft">
                  {t("ui.eventComposer.previousCycle", { n: supersedes.length })}
                </span>
              )}
              {ready && (
                <span className="data text-[0.6875rem] text-ink-soft">
                  {t("ui.eventComposer.rowsOneWrite", { count: (rows as SavedWildlife[]).length })}
                </span>
              )}
            </div>

          {/* Said without a worked example. Twenty-one days and a clutch is one
              animal's case, and this form takes ewes, does, sows and queen bees on
              the same clock. */}
          <Note>
            {t("ui.eventComposer.countsAreYours")}
          </Note>
          </div>
        </div>
      )}
    </>
  );
}
