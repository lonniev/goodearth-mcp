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
import { wildlifeCalendar, type WildlifeResult } from "../lib/mcp";
import {
  deleteWildlife, DRIVER_HELP, listWildlife, makeWildlife, saveWildlife,
  WILDLIFE_STARTERS, type SavedWildlife,
} from "../lib/wildlifeModels";
import type { SavedRegion } from "../lib/regions";

const CLOCK: Record<string, { label: string; cls: string }> = {
  heat:     { label: "heat",     cls: "bg-growth/12 text-growth" },
  daylight: { label: "daylight", cls: "bg-honey/15 text-honey" },
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
  const [driver, setDriver] = useState<"heat" | "daylight" | "calendar">("daylight");

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
          : { typical_on: String(f.get("on") ?? "") }),
    }, region.id);
    if (typeof made === "string") { setError(made); return; }
    setError("");
    setModels(saveWildlife(made).filter((m) => m.regionId === region.id));
    e.currentTarget.reset();
  }

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Wildlife</h1>
        <span className="text-[13px] text-ink-soft">{region.name}</span>
      </div>

      {error && <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">{error}</div>}

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

      <h2 className="figure mb-2.5 flex items-baseline gap-2.5 text-[18px] font-semibold">
        The year
        {models.length > 0 && <Provenance tool="goodearth_wildlife_calendar" at={ranAt} onCost={onCost} />}
      </h2>
      {data?.summary && <p className="mb-2.5 text-[13px] text-ink-soft">{data.summary}</p>}

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel p-8 text-center text-[13px] text-ink-soft">Reading…</div>
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
        <div className="rounded-md border border-dashed border-rule bg-panel/60 p-6 text-[13px] leading-relaxed text-ink-soft">
          Nothing tracked on {region.name} yet. Start from a shape below — when
          do your robins arrive, when do the squirrels start caching — and the
          calendar works out when it happens on this ground.
        </div>
      )}

      {/* ── Add ────────────────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">Track something</h2>
      <form onSubmit={add} className="rounded-md border border-rule bg-panel p-4">
        <div className="flex flex-wrap gap-1.5">
          {(["daylight", "heat", "calendar"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDriver(d)}
              className={`min-h-11 rounded-full border px-4 text-[13px] font-medium ${
                driver === d ? "border-ink bg-ink text-paper" : "border-rule active:bg-band"}`}>
              {CLOCK[d].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-ink-soft">{DRIVER_HELP[driver]}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="species" label="Creature" placeholder="American robin" />
          <Field name="event" label="Event" placeholder="first arrival" />
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
                  className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2 text-[16px] focus:border-honey focus:outline-none">
                  <option value="up">days lengthening</option>
                  <option value="down">days shortening</option>
                </select>
              </label>
            </>
          )}
          {driver === "calendar" && <Field name="on" label="Typical (MM-DD)" placeholder="09-15" />}
        </div>

        <button className="mt-3 min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
          Track it
        </button>
      </form>

      <div className="mt-5">
        <span className="eyebrow">Start from a shape</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {WILDLIFE_STARTERS.map((s) => (
            <button key={s.species + s.event}
              onClick={() => {
                const made = makeWildlife(s, region.id);
                if (typeof made !== "string") {
                  setModels(saveWildlife(made).filter((m) => m.regionId === region.id));
                }
              }}
              className="data min-h-11 rounded-full border border-rule bg-panel px-4 text-[12px] text-ink-soft active:border-ink active:text-ink">
              {s.emoji} {s.species}
            </button>
          ))}
        </div>
        <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-soft">
          Shapes to edit, not published natural history. What is right for a
          particular valley belongs to a local naturalist, an extension
          bulletin, or your own years of noticing — Good Earth only works out
          when <em>your</em> threshold arrives on <em>your</em> ground.
        </p>
      </div>
    </>
  );
}

function Field({ name, label, placeholder }: { name: string; label: string; placeholder: string }) {
  return (
    <label className="block text-[11px] text-ink-soft">
      {label}
      <input name={name} placeholder={placeholder}
        className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] text-ink focus:border-honey focus:outline-none" />
    </label>
  );
}
