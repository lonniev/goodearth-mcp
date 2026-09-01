// The calendar feed: publish once, then live in the calendar you already use.
//
// This was the first thing on the To-Do page, which put a once-per-region
// setup step in front of the two things done daily. It belongs with the other
// settings.
//
// Season events go out as all-day entries and reminders as VTODO, which Apple
// Reminders, Google Tasks and Thunderbird all surface as reminders rather than
// as another appointment on an already full day. One subscription carries
// both.

import { useCallback, useEffect, useState } from "react";
import {
  calendarList, calendarRevoke, calendarSubscribe, taskList,
  type CalendarFeedResult, type FeedRow,
} from "../lib/mcp";
import { listPlantings } from "../lib/plantings";
import { listPests } from "../lib/pestModels";
import { listWildlife } from "../lib/wildlifeModels";
import type { SavedRegion } from "../lib/regions";
import { ErrorBox, Section } from "./ui";

export default function CalendarFeed({ region }: { region: SavedRegion }) {
  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [fresh, setFresh] = useState<CalendarFeedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const refreshFeeds = useCallback(async () => {
    try {
      const r = await calendarList();
      if (r.success) setFeeds(r.feeds);
    } catch { /* the list is a convenience; publishing works without it */ }
  }, []);
  useEffect(() => { void refreshFeeds(); }, [refreshFeeds]);

  const mine = feeds.find((f) => f.region_name === region.name);

  const publish = useCallback(async (token?: string) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      // Tasks live on the server now, so they are fetched rather than read
      // from this device — which also means a task added on the phone is in
      // the feed published from the laptop.
      const t = await taskList(region.id, { timeframe: "all", page_size: 200 });
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
        todos: (t.rows ?? []).map((x) => ({
          id: x.id, title: x.title, due: x.due ?? undefined, note: x.note ?? undefined,
          done: x.done, reminder_only: x.reminder_only,
          starts_at: x.starts_at ?? undefined, ends_at: x.ends_at ?? undefined,
        })),
      });
      if (!r.success) { setErr(r.error || "The calendar could not be published."); return; }
      setFresh(r);
      setMsg(token ? "Refreshed — subscribers update in place." : "Published.");
      void refreshFeeds();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [region, refreshFeeds]);

  const url = fresh?.url ?? mine?.url;
  const webcal = fresh?.webcal_url ?? (mine ? mine.url.replace(/^https:/, "webcal:") : undefined);

  return (
    <>
      <Section emoji="🗓️" title="Calendar feed" />
      {err && <ErrorBox>{err}</ErrorBox>}

      <div className="rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3.5">
        {url ? (
          <>
            <p className="text-[13px]">
              <b>{region.name}</b> is published.
              {fresh?.entries != null && ` ${fresh.entries} entries.`}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <a href={webcal}
                className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-ink bg-ink px-4 text-[12.5px] font-semibold text-paper">
                Subscribe on this device
              </a>
              <button onClick={() => { void navigator.clipboard?.writeText(url); setMsg("Link copied."); }}
                className="min-h-11 rounded-full border-[1.5px] border-ink px-4 text-[12.5px] font-semibold active:bg-ink active:text-paper">
                Copy link for Google Calendar
              </button>
              <button onClick={() => void publish(mine?.token ?? fresh?.token)} disabled={busy}
                className="min-h-11 rounded-full border border-rule px-4 text-[12.5px] text-ink-soft active:bg-band disabled:opacity-40">
                {busy ? "Recomputing…" : "Recompute"}
              </button>
              {mine && (
                <button onClick={async () => { await calendarRevoke(mine.token); setFresh(null); void refreshFeeds(); }}
                  className="min-h-11 rounded-full px-4 text-[12.5px] text-ink-soft active:text-clay">
                  Stop publishing
                </button>
              )}
            </div>
            <p className="data mt-2.5 break-all text-[10.5px] text-ink-soft">{url}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
              Your client re-reads this on its own schedule. <b>Recompute</b> rebuilds it
              against current weather and rewrites the same feed in place, so subscribers
              update rather than ending up with two of everything.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px]">
              Publish <b>{region.name}</b> once and its season events and reminders arrive
              in whatever calendar you already read.
            </p>
            <button onClick={() => void publish()} disabled={busy}
              className="mt-2.5 min-h-11 rounded-full border-[1.5px] border-ink bg-ink px-4 text-[12.5px] font-semibold text-paper disabled:opacity-40">
              {busy ? "Publishing…" : "Publish this region"}
            </button>
          </>
        )}
        {msg && <p className="mt-2 text-[12px] text-growth">{msg}</p>}
      </div>
    </>
  );
}
