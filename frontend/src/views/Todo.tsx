// To-Do — the work, and the calendar that carries it off this screen.
//
// A grower does not live in this app. They live in whatever calendar tells
// them about the school run and the market stall, so the point of this page is
// not to be visited: it is to publish, once, and then be right in the place
// they already look.
//
// Tasks go out as VTODO, which Apple Reminders, Google Tasks and Thunderbird
// surface as reminders. Season events go out as all-day entries. One
// subscription carries both.

import { useCallback, useEffect, useState } from "react";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import {
  calendarList, calendarRevoke, calendarSubscribe,
  type CalendarFeedResult, type FeedRow,
} from "../lib/mcp";
import { deleteTodo, listTodos, makeTodo, saveTodo, toggleTodo, type Todo } from "../lib/todos";
import { listPlantings } from "../lib/plantings";
import { listPests } from "../lib/pestModels";
import { listWildlife } from "../lib/wildlifeModels";
import type { SavedRegion } from "../lib/regions";

const nice = (iso: string) =>
  new Date(iso.length > 10 ? iso : iso + "T12:00:00")
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function TodoView({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  const [todos, setTodos] = useState<Todo[]>(() => listTodos(region.id));
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [fresh, setFresh] = useState<CalendarFeedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);

  useEffect(() => { setTodos(listTodos(region.id)); }, [region.id]);

  const refreshFeeds = useCallback(async () => {
    try {
      const r = await calendarList();
      if (r.success) setFeeds(r.feeds);
    } catch { /* the list is a convenience; publishing still works without it */ }
  }, []);
  useEffect(() => { void refreshFeeds(); }, [refreshFeeds]);

  const mine = feeds.find((f) => f.region_name === region.name);

  const publish = useCallback(async (token?: string) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await calendarSubscribe({
        region: region.region,
        regionName: region.name,
        baseTemp: region.baseTempF,
        token,
        plantings: listPlantings(region.id).map((p) => ({
          crop: p.crop, gdd_target: p.gddTarget, set_out: p.setOut,
          ...(p.baseTempF != null ? { base_temp: p.baseTempF } : {}),
        })),
        pests: listPests(region.id).map(({ id: _i, regionId: _r, ...m }) => m),
        wildlifeEvents: listWildlife(region.id).map(({ id: _i, regionId: _r, ...e }) => e),
        todos: listTodos(region.id).map((t) => ({
          id: t.id, title: t.title, due: t.due, note: t.note,
          done: t.done, priority: t.priority,
        })),
      });
      if (!r.success) { setErr(r.error || "The calendar could not be published."); return; }
      setFresh(r); setRanAt(new Date());
      setMsg(token ? "Refreshed — subscribers update in place." : "Published.");
      void refreshFeeds();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [region, refreshFeeds]);

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const made = makeTodo(
      String(f.get("title") ?? ""), region.id,
      String(f.get("due") ?? "") || undefined,
      String(f.get("note") ?? "") || undefined,
      f.get("high") ? 1 : undefined,
    );
    if (typeof made === "string") { setErr(made); return; }
    setErr("");
    setTodos(saveTodo(made).filter((t) => t.regionId === region.id));
    e.currentTarget.reset();
  }

  const url = fresh?.url ?? mine?.url;
  const webcal = fresh?.webcal_url ?? (mine ? mine.url.replace(/^https:/, "webcal:") : undefined);
  const open = todos.filter((t) => !t.done).length;

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">To-Do</h1>
        <span className="text-[13px] text-ink-soft">
          {region.name} · {open} open
        </span>
      </div>

      {err && <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">{err}</div>}

      {/* ── The calendar ───────────────────────────────────────────────── */}
      <h2 className="figure mb-2.5 flex flex-wrap items-baseline gap-2.5 text-[18px] font-semibold">
        📅 On your calendar
        {ranAt && <Provenance tool="goodearth_calendar_subscribe" at={ranAt} onCost={onCost} />}
      </h2>

      {busy ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller heading="Composing the season" />
        </div>
      ) : url ? (
        <div className="rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3.5">
          <p className="text-[13px] leading-relaxed">
            {region.name} is published.{" "}
            {fresh && (
              <>
                {fresh.total} entries — {Object.entries(fresh.entries)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(", ")}.
              </>
            )}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <a href={webcal}
              className="min-h-11 rounded border-[1.5px] border-ink bg-ink px-4 text-[13px] font-semibold text-paper inline-flex items-center">
              Subscribe on this device
            </a>
            <button
              onClick={() => { void navigator.clipboard?.writeText(url); setMsg("Link copied."); }}
              className="min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
              Copy link for Google Calendar
            </button>
            <button onClick={() => publish(fresh?.token ?? mine?.token)} disabled={busy}
              className="min-h-11 rounded border border-rule px-4 text-[13px] active:bg-band">
              Recompute
            </button>
            {(fresh?.token ?? mine?.token) && (
              <button
                onClick={async () => {
                  const t = fresh?.token ?? mine!.token;
                  await calendarRevoke(t);
                  setFresh(null); setMsg("Stopped publishing."); void refreshFeeds();
                }}
                className="min-h-11 rounded px-3 text-[13px] text-ink-soft active:text-clay">
                Stop publishing
              </button>
            )}
          </div>

          <p className="data mt-2.5 break-all text-[10.5px] text-ink-soft">{url}</p>
          <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-soft">
            Your client re-reads this on its own schedule and that costs nothing —
            polling forever must never drain a balance. <b>Recompute</b> is the
            paid act, and it rewrites the same feed in place, so subscribers
            update rather than ending up with two of everything.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-rule bg-panel/60 p-5">
          <p className="max-w-prose text-[13px] leading-relaxed text-ink-soft">
            You do not live in this app. You live in whatever calendar tells you
            about the school run and the market stall — so publish {region.name}{" "}
            there instead. Crop targets, pest stages, wildlife and husbandry
            dates and the frost record arrive as all-day entries; the tasks
            below arrive as reminders.
          </p>
          <button onClick={() => publish()} disabled={busy}
            className="mt-3 min-h-11 rounded border-[1.5px] border-ink bg-ink px-5 text-[13px] font-semibold text-paper disabled:opacity-40">
            Publish {region.name}
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-[12.5px] text-ink-soft">{msg}</p>}

      {/* ── The tasks ──────────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">✅ Tasks</h2>
      {todos.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule bg-panel/60 p-5 text-[13px] text-ink-soft">
          Nothing on the list for {region.name}.
        </p>
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => (
            <li key={t.id}
              className={`flex items-start gap-3 rounded-md border border-rule bg-panel px-3.5 py-2.5 ${
                t.done ? "opacity-55" : ""}`}>
              <button onClick={() => setTodos(toggleTodo(t.id).filter((x) => x.regionId === region.id))}
                aria-label={t.done ? "Mark not done" : "Mark done"}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-rule text-[14px]">
                {t.done ? "✓" : ""}
              </button>
              <div className="min-w-0 flex-1">
                <span className={`text-[13.5px] ${t.done ? "line-through" : ""}`}>{t.title}</span>
                {t.priority === 1 && <span className="ml-2 rounded-full bg-clay/12 px-2 py-0.5 text-[10.5px] font-semibold text-clay">high</span>}
                {t.due && <span className="data ml-2 text-[11px] text-ink-soft">due {nice(t.due)}</span>}
                {t.note && <p className="mt-0.5 text-[12.5px] text-ink-soft">{t.note}</p>}
              </div>
              <button onClick={() => setTodos(deleteTodo(t.id).filter((x) => x.regionId === region.id))}
                aria-label="Delete" className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft lg:col-span-2">What needs doing
            <input name="title" placeholder="Cover the east beds"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
          <label className="block text-[11px] text-ink-soft">Due
            <input name="due" type="date"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
          <label className="flex min-h-11 items-center gap-2 self-end text-[12.5px]">
            <input name="high" type="checkbox" className="h-5 w-5 accent-[color:var(--color-clay)]" />
            High priority
          </label>
        </div>
        <label className="mt-3 block text-[11px] text-ink-soft">Note
          <input name="note" placeholder="Row cover is in the east barn"
            className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
        <button className="mt-3 min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
          Add task
        </button>
        <p className="mt-2 text-[12px] text-ink-soft">
          Added tasks reach your calendar on the next <b>Recompute</b>.
        </p>
      </form>
    </>
  );
}
