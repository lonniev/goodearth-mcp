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
  calendarList, calendarSubscribe, type CalendarFeedResult,
} from "./mcp";
import type { SavedRegion } from "./regions";

export async function publishRegion(
  region: SavedRegion, token?: string,
): Promise<CalendarFeedResult> {
  // One argument. This function used to fan in four stores — plantings, pests
  // and wildlife from the device, tasks from the server — and hand them all to
  // the feed. They live on the block now, so the server reads them itself, and
  // a refresh can no longer publish a smaller season than the one it replaced
  // just because the caller did not know what the first call had passed.
  return calendarSubscribe({ block: region.id, token });
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
///
/// Two speeds, for two kinds of change. Adding or editing a task is a
/// deliberate act, done once, and is sent straight away: a debounce there can
/// be outlived by closing the tab, and the recompute that never fires is
/// exactly the silent miss this is meant to prevent. Ticking boxes off is
/// rapid, so those coalesce — four ticks are one refresh, not four.
export function makeFeedRefresher(region: SavedRegion, token: string | null) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (token) void publishRegion(region, token);
  };

  return {
    now: send,
    soon: () => {
      if (!token) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, 2500);
    },
  };
}
