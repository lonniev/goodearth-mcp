// Republishing a region's calendar.
//
// Lives here rather than in the calendar panel because two places need it:
// the panel, where a grower asks for it, and the task list, where nobody
// should have to.
//
// The page used to carry a sentence saying tasks reach the calendar "on the
// next recompute". That sentence existed because the app did not do it, and
// explaining a gap is not the same as closing one — the promise is publish
// once and then live in the calendar you already read.

import {
  calendarList, calendarSubscribe, taskList, type CalendarFeedResult,
} from "./mcp";
import { listPlantings } from "./plantings";
import { listPests } from "./pestModels";
import { listWildlife } from "./wildlifeModels";
import type { SavedRegion } from "./regions";

export async function publishRegion(
  region: SavedRegion, token?: string,
): Promise<CalendarFeedResult> {
  // Tasks come from the server, so a task added on the phone is in the feed
  // published from the laptop.
  const t = await taskList(region.id, { timeframe: "all", page_size: 200 });
  return calendarSubscribe({
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
}

/// The token this region is published under, or null if it is not published.
export async function publishedToken(regionName: string): Promise<string | null> {
  try {
    const r = await calendarList();
    if (!r.success) return null;
    return r.feeds.find((f) => f.region_name === regionName)?.token ?? null;
  } catch { return null; }
}

/// Refresh an ALREADY-published feed after its contents changed.
///
/// Only refreshes what the grower already chose to publish — it never starts
/// publishing on its own, because that would put a link into the world as a
/// side effect of ticking off a task.
export function makeFeedRefresher(region: SavedRegion, token: string | null) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (!token) return;
    // Debounced: ticking four things off is one refresh, not four.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void publishRegion(region, token); }, 2500);
  };
}
