// The calendar feed: publish once, then live in the calendar you already use.
//
// This was the first thing on the Tasks page, which put a once-per-region
// setup step in front of the two things done daily. It belongs with the other
// settings.
//
// Season events go out as all-day entries and reminders as VTODO, which Apple
// Reminders, Google Tasks and Thunderbird all surface as reminders rather than
// as another appointment on an already full day. One subscription carries
// both.

import { useCallback, useEffect, useState } from "react";
import { calendarList, calendarRevoke, type CalendarFeedResult, type FeedRow } from "../lib/mcp";
import { publishRegion } from "../lib/publishFeed";
import type { SavedRegion } from "../lib/regions";
import { ErrorBox } from "./ui";
import { Tx } from "@tollbooth-dpyc/web/react";
import { useT, WORDS } from "../i18n";

export default function CalendarFeed({ region }: { region: SavedRegion }) {
  const t = useT();
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
      const r = await publishRegion(region, token);
      if (!r.success) { setErr(r.error || t("ui.calendarFeed.couldNotPublish")); return; }
      setFresh(r);
      setMsg(token ? t("ui.calendarFeed.refreshed") : t("ui.calendarFeed.published"));
      void refreshFeeds();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [region, refreshFeeds, t]);

  const url = fresh?.url ?? mine?.url;
  const webcal = fresh?.webcal_url ?? (mine ? mine.url.replace(/^https:/, "webcal:") : undefined);

  return (
    <div className="rounded-xl border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
      <div className="eyebrow mb-1">🗓️ {t("ui.calendarFeed.title")}</div>
      {err && <ErrorBox>{err}</ErrorBox>}
        {url ? (
          <>
            <p className="text-[0.8125rem]">
              <Tx ns={WORDS} k="ui.calendarFeed.isPublished" vars={{ name: region.name }} components={{ b: <b /> }} />
              {fresh?.entries != null && ` ${t("ui.calendarFeed.entries", { n: String(fresh.entries) })}`}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <a href={webcal}
                className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-ink bg-ink px-4 text-[0.78125rem] font-semibold text-paper">
                {t("ui.calendarFeed.subscribe")}
              </a>
              <button onClick={() => { void navigator.clipboard?.writeText(url); setMsg(t("ui.calendarFeed.linkCopied")); }}
                className="min-h-11 rounded-full border-[1.5px] border-ink px-4 text-[0.78125rem] font-semibold active:bg-ink active:text-paper">
                {t("ui.calendarFeed.copyLink")}
              </button>
              <button onClick={() => void publish(mine?.token ?? fresh?.token)} disabled={busy}
                className="min-h-11 rounded-full border border-rule px-4 text-[0.78125rem] text-ink-soft active:bg-band disabled:opacity-40">
                {busy ? t("ui.calendarFeed.recomputing") : t("ui.calendarFeed.recompute")}
              </button>
              {mine && (
                <button onClick={async () => { await calendarRevoke(mine.token); setFresh(null); void refreshFeeds(); }}
                  className="min-h-11 rounded-full px-4 text-[0.78125rem] text-ink-soft active:text-clay">
                  {t("ui.calendarFeed.stop")}
                </button>
              )}
            </div>
            <p className="data mt-2.5 break-all text-[0.65625rem] text-ink-soft">{url}</p>
            <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-soft">
              <Tx ns={WORDS} k="ui.calendarFeed.howItWorks" components={{ b: <b /> }} />
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-[14rem] flex-1 text-[0.8125rem] leading-snug">
              <Tx ns={WORDS} k="ui.calendarFeed.publishOnce" vars={{ name: region.name }} components={{ b: <b /> }} />
            </p>
            <button onClick={() => void publish()} disabled={busy}
              className="min-h-11 shrink-0 rounded-full border-[1.5px] border-ink bg-ink px-4 text-[0.78125rem] font-semibold text-paper disabled:opacity-40">
              {busy ? t("ui.calendarFeed.publishing") : t("ui.calendarFeed.publishRegion")}
            </button>
          </div>
        )}
        {msg && <p className="mt-2 text-[0.75rem] text-growth">{msg}</p>}

        {/* What the feed could not date, in the service's own words.
            The builder has always returned this list — it validates each row
            on its own so that one it cannot read does not cost the grower the
            other forty — and nothing on the client had a field to put it in.
            A grower whose heron never appeared on their calendar was told
            nothing at all, which reads as the feed being broken rather than as
            a row that names no date. */}
        {(fresh?.skipped?.length ?? 0) > 0 && (
          <div className="mt-3 border-t border-rule pt-2.5">
            <span className="eyebrow">{t("ui.calendarFeed.notOnCalendar")}</span>
            <ul className="mt-1 space-y-1 text-[0.75rem] text-ink-soft">
              {fresh!.skipped!.map((sk, i) => (
                <li key={`${sk.name}-${i}`}>
                  <b className="text-ink">{sk.name}</b> — {sk.reason}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[0.71875rem] leading-relaxed text-ink-soft">
              {t("ui.calendarFeed.everythingElse")}
            </p>
          </div>
        )}
    </div>
  );
}
