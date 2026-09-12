// Track something — picked, not typed.
//
// The form this replaces asked a grower to type the creature's name, and to
// type `typical_on` as "MM-DD". Both are things the service already knows or
// can offer: iNaturalist has the animals recorded around this ground, the
// grower's own record has the flock in the barn, and a month and a day are two
// short lists. A typed date invites "Sept 5", "9/5" and "05-09", and only one
// of those is what the record wanted.
//
// Two places still take free text and they are the two the brief allows: an
// animal that is in no source, and the short label for what it does. Both are
// the grower's own words about their own ground, which no list can supply.
//
// The five clocks are here, including `condition`, which the server has always
// taken and the form has never offered.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  almanacFor, gddSeasonCurve, speciesHabits, wildlifeCalendar, wildlifeCatalog,
  type AlmanacResult, type SeasonCurveResult, type WildlifeCatalogResult,
  type WildlifeEventInput, type WildlifeResult,
} from "../lib/mcp";
import {
  cycleRows, filterSpecies, labelsUsed, lastInterval, mergeSpecies,
  type CycleDraft, type Milestone, type Pick,
} from "../lib/husbandry";
import { makeWildlife, DRIVER_HELP, type SavedWildlife } from "../lib/wildlifeModels";
import type { SavedRegion } from "../lib/regions";
import Provenance from "./Provenance";
import { useSubmit } from "../lib/useSubmit";
import { useUnits } from "./Units";
import {
  ErrorBox, FIELD, ICON, IconButton, LifecycleMark, MonthDay, Note, Pill,
  Section, SpeciesMark, Stepper, TrashGlyph,
} from "./ui";

type Driver = "calendar" | "interval" | "daylight" | "heat" | "condition";

const CLOCKS: { key: Driver; label: string }[] = [
  { key: "interval", label: "days from" },
  { key: "calendar", label: "your record" },
  { key: "daylight", label: "daylight" },
  { key: "heat", label: "heat" },
  { key: "condition", label: "conditions" },
];

const HELP: Record<Driver, string> = {
  ...DRIVER_HELP as Record<Driver, string>,
  interval: "A count of days from a day you saw — a cycle. Gestation, "
    + "incubation, days to point of lay.",
  condition: "What the weather has to do. Re-dates itself every season from "
    + "this ground's own record.",
};

const today = () => new Date().toISOString().slice(0, 10);
const day = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function EventComposer({
  region, recorded, onSave, onCost, seed, onSeedTaken,
}: {
  region: SavedRegion;
  recorded: SavedWildlife[];
  /// `supersedes` names the rows this cycle replaces — the previous brood,
  /// when the grower started another. Empty for anything entered from scratch.
  onSave: (rows: SavedWildlife[], supersedes: string[]) => Promise<void>;
  onCost: (sats: number) => void;
  /// A cycle handed in from the record — "start another brood". It arrives
  /// filled in, so the grower's only remaining decision is the day.
  seed?: (CycleDraft & { supersedes?: string[] }) | null;
  onSeedTaken?: () => void;
}) {
  const u = useUnits();
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

  /// Asked for once, and only when the grower goes looking. A catalogue read
  /// costs a fare, and a page visit that never touches this panel should not.
  const askCatalog = useCallback(async () => {
    if (catAsked) return;
    setCatAsked(true); setCatBusy(true);
    try {
      const r = await wildlifeCatalog(region.id);
      if (r.success) setCatalog(r);
      else setError(r.error || "What is recorded here could not be read.");
    } catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setCatBusy(false); }
  }, [catAsked, region.id]);

  const all = useMemo(() => mergeSpecies(catalog, recorded), [catalog, recorded]);
  const shown = useMemo(() => filterSpecies(all, q).slice(0, 40), [all, q]);

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
    onSeedTaken?.();
  }, [seed, onSeedTaken]);

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
      gdd, base, after, minNight, minDay, wet, region.id]);

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
    const t = setTimeout(() => {
      previewed.current = signature;
      setPreviewBusy(true);
      const list = (JSON.parse(signature) as SavedWildlife[])
        .map(({ id, regionId: _r, ...e }) => ({ ...e, ref: id }));
      void wildlifeCalendar(region.id, list as WildlifeEventInput[])
        .then((r) => {
          if (previewed.current !== signature) return;
          if (r.success) { setPreview(r); setPreviewAt(new Date()); }
          else setError(r.error || "The dates could not be worked out.");
        })
        .catch((e) => setError(String((e as Error).message ?? e)))
        .finally(() => setPreviewBusy(false));
    }, 900);
    return () => clearTimeout(t);
  }, [signature, region.id]);

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
      <Section emoji="➕" title="Track something" />
      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="rounded-md border border-rule bg-panel p-4">
        {/* ── What is being tracked ──────────────────────────────────── */}
        {/* "Animal" was wrong as soon as the finder learned about fungi: a
            chanterelle added from Community Observations lands on this same
            record and then appears in this same list. A morel is not an
            animal, and the label was quietly telling the grower they had put
            it in the wrong place. */}
        <label className="block text-[11px] text-ink-soft">
          Species
          <input
            value={animal ? animal.name : q}
            onFocus={() => { setOpen(true); void askCatalog(); }}
            onChange={(e) => { setAnimal(null); setQ(e.target.value); setOpen(true); }}
            placeholder="hen, ewe, robin, chanterelle…"
            className={FIELD} />
        </label>

        {open && !animal && (
          <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-rule bg-paper">
            {catBusy && <p className="px-3 py-2 text-[12px] text-ink-soft">Reading what is recorded here…</p>}
            {shown.map((p) => (
              <button key={p.name} type="button"
                onClick={() => { setAnimal(p); setSupersedes([]); setOpen(false); setQ(""); }}
                className="flex w-full items-center gap-2.5 border-b border-rule px-2.5 py-2 text-left last:border-b-0 active:bg-band">
                <SpeciesMark emoji={p.emoji} photo={p.photo ?? undefined} />
                <span className="min-w-0 flex-1 leading-tight">
                  <b className="block truncate text-[13px]">{p.name}</b>
                  {p.scientificName && (
                    <i className="block truncate text-[11px] text-ink-soft">{p.scientificName}</i>
                  )}
                </span>
                <span className="data shrink-0 text-right text-[10.5px] text-ink-soft">
                  {/* Something the grower already tracks has no sighting
                      count of its own — nobody submits observations of a
                      laying flock — and "0 nearby" about it would be
                      arithmetic dressed up as a fact. It used to read "yours",
                      which named the owner and not the reason. */}
                  {p.yours
                    ? <span className="text-growth">on your record</span>
                    : (p.observations ?? 0).toLocaleString()}
                  {p.hasHabits && <span className="block"><LifecycleMark /></span>}
                </span>
              </button>
            ))}
            {!catBusy && !shown.length && (
              <button type="button"
                onClick={() => { setAnimal({ name: q.trim() }); setOpen(false); }}
                disabled={!q.trim()}
                className="w-full px-3 py-2.5 text-left text-[13px] disabled:opacity-40">
                {/* The escape hatch. Nothing recorded around a block covers
                    every animal on it, and a grower must not be stopped by a
                    catalogue that has not heard of their goat. */}
                Nothing listed. Add <b>{q.trim() || "…"}</b> as your own.
              </button>
            )}
          </div>
        )}

        {animal && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(["friend", "foe", "watch"] as const).map((r) => (
              <Pill key={r} active={role === r} onClick={() => setRole(role === r ? "" : r)}>
                {r}
              </Pill>
            ))}
            <button type="button" onClick={reset}
              className="ml-auto min-h-11 text-[12px] text-ink-soft underline">
              start over
            </button>
          </div>
        )}

        {/* ── The clock ──────────────────────────────────────────────── */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CLOCKS.map((c) => (
            <Pill key={c.key} active={driver === c.key}
              onClick={() => {
                setDriver(c.key); setSupersedes([]);
                if (c.key === "interval" && !steps.length) setSteps([{ label: "", days: 1 }]);
              }}>
              {c.label}
            </Pill>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-ink-soft">{HELP[driver]}</p>

        {/* ── What it does ───────────────────────────────────────────── */}
        <datalist id="goodearth-labels">
          {[...new Set([...habits, ...mine])].map((h) => <option key={h} value={h} />)}
        </datalist>
        <label className="mt-3 block text-[11px] text-ink-soft">
          {driver === "interval" ? "What you saw" : "What it does"}
          <input value={label} list="goodearth-labels"
            onChange={(e) => setLabel(e.target.value)}
            placeholder={driver === "interval" ? "laying on eggs" : "first arrival"}
            className={FIELD} />
        </label>
        {(habits.length > 0 || mine.length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[...new Set([...habits, ...mine])].slice(0, 12).map((h) => (
              <button key={h} type="button" onClick={() => setLabel(h)}
                className="min-h-11 rounded-full border border-rule bg-paper px-3.5 text-[12px] active:border-ink">
                {h}
              </button>
            ))}
          </div>
        )}

        {/* ── The clock's own question ───────────────────────────────── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {driver === "interval" && (
            <>
              <label className="block text-[11px] text-ink-soft">
                The day it happened
                <input type="date" value={startOn} max={today()}
                  onChange={(e) => setStartOn(e.target.value)} className={FIELD} />
              </label>
              <div className="sm:col-span-2">
                <span className="eyebrow">And then, counting from that day</span>
                {steps.map((s, i) => (
                  <div key={i} className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="block text-[11px] text-ink-soft">
                      What follows
                      <input value={s.label} placeholder="eggs hatch" className={FIELD}
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
                        <Stepper label="Days" value={s.days} min={1} max={1000}
                          onChange={(n) => setSteps(steps.map((x, j) =>
                            j === i ? { ...x, days: typeof n === "number" ? n : 0 } : x))} />
                      </div>
                      <button type="button" aria-label={`Remove ${s.label || "milestone"}`}
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
                    + a milestone{remembered ? ` (${remembered} days, as you had it)` : ""}
                  </Pill>
                </div>
              </div>
            </>
          )}

          {driver === "calendar" && (
            <MonthDay label="Typically on" value={typicalOn} onChange={setTypicalOn} />
          )}

          {driver === "daylight" && (
            <>
              <label className="block text-[11px] text-ink-soft sm:col-span-2">
                Day length — {typeof hours === "number" ? hours.toFixed(1) : "—"} h
                <input type="range" min={daylight ? Math.floor(daylight.low * 10) / 10 : 8}
                  max={daylight ? Math.ceil(daylight.high * 10) / 10 : 16}
                  step={0.1} value={hours === "" ? 12 : hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="mt-1.5 w-full accent-honey" />
                <span className="data mt-0.5 block text-[10.5px] text-ink-soft">
                  {daylight
                    ? `${region.name} runs ${daylight.low.toFixed(1)}–${daylight.high.toFixed(1)} h this season`
                    : "reading this block's day length…"}
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <Pill active={rising} onClick={() => setRising(true)}>days lengthening</Pill>
                <Pill active={!rising} onClick={() => setRising(false)}>days shortening</Pill>
              </div>
            </>
          )}

          {driver === "heat" && (
            <>
              <Stepper label={u.ddUnit.trim()} value={gdd} min={1} max={20000} step={25}
                onChange={setGdd} />
              <Stepper label={`Base${u.tempUnit}`} value={base} min={Math.round(u.temp(20))}
                max={Math.round(u.temp(80))} onChange={setBase} />
              <p className="data text-[11px] text-ink-soft sm:col-span-2">
                {curve?.accumulated_gdd
                  ? `${region.name} has ${Math.round(u.degreeDays(curve.accumulated_gdd.mean)).toLocaleString()} `
                    + `${u.ddUnit.trim()} on the season so far.`
                  : "reading this block's season so far…"}
              </p>
            </>
          )}

          {driver === "condition" && (
            <>
              <MonthDay label="Not before" value={after} onChange={setAfter} />
              <Stepper label={`Night at or above${u.tempUnit}`} value={minNight}
                min={Math.round(u.temp(20))} max={Math.round(u.temp(80))}
                onChange={setMinNight} />
              <Stepper label={`Day at or above${u.tempUnit}`} value={minDay}
                min={Math.round(u.temp(20))} max={Math.round(u.temp(80))}
                onChange={setMinDay} />
              <div className="flex items-end">
                <Pill active={wet} onClick={() => setWet(!wet)}>and it rained</Pill>
              </div>
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
          <div className="mt-3 text-[13px]">
            {previewBusy ? (
              <p className="text-[12.5px] text-ink-soft">Working out the dates…</p>
            ) : (
              <ul className="space-y-1">
                {preview!.events.map((e) => {
                  const when = e.reached_on ?? e.projected_date;
                  return (
                    <li key={e.ref ?? e.event}>
                      <b>{e.event}</b>{" — "}
                      {when ? day(when) : "not this season"}
                      {e.window && (
                        <span className="data text-[11px] text-ink-soft">
                          {" "}({day(e.window.from)}–{day(e.window.to)})
                        </span>
                      )}
                      {e.days_away != null && (
                        <span className="data text-[11px] text-ink-soft"> · in {e.days_away} days</span>
                      )}
                    </li>
                  );
                })}
                {preview!.events.length === 0 && (
                  <li className="text-[12.5px] text-ink-soft">
                    Nothing to date from this yet — it is recorded all the same.
                  </li>
                )}
              </ul>
            )}
            {previewAt && !stale && (
              <>
                <p className="data mt-1 text-[10.5px] text-ink-soft">
                  Good Earth worked these out on your ground, not this browser.
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
          <IconButton path={ICON.add} label="Record"
            disabled={!ready || submit.busy}
            onClick={() => {
              if (typeof rows === "string") { setError(rows); return; }
              setError("");
              // One write for the whole cycle: one fare, and no chance of a
              // hatch date saved against a start that is not there.
              submit.run(async () => { await onSave(rows, supersedes); reset(); });
            }} />
          {/* The reason it is disabled — except the one that is already on
              screen. An empty first field does not need a sentence asking for
              it; the field is right there, blank, and the button is grey. The
              messages worth showing are the ones a glance does not answer: a
              count that will not parse, a day that is not a day. */}
          {!ready && !obvious && (
            <span className="text-[12px] text-ink-soft">{rows as string}</span>
          )}
          {supersedes.length > 0 && (
            <span className="data text-[11px] text-ink-soft">
              The previous {supersedes.length}-row cycle is kept as history and
              comes off the calendar.
            </span>
          )}
          {ready && (
            <span className="data text-[11px] text-ink-soft">
              {(rows as SavedWildlife[]).length} row
              {(rows as SavedWildlife[]).length === 1 ? "" : "s"}, one write
            </span>
          )}
        </div>
      </div>

      {/* Said without a worked example. Twenty-one days and a clutch is one
          animal's case, and this form takes ewes, does, sows and queen bees on
          the same clock. */}
      <Note>
        The counts are yours. Good Earth adds the days you give it to the day
        you saw and says when the window opens. How long a thing takes belongs
        to your animals and your breed, and your own records beat any average
        this service could ship.
      </Note>
    </>
  );
}
