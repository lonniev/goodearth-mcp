// The viewer's clock: when an answer was read, a change queued, a radar frame
// taken — instants, shown in the zone the patron picked on Account.
//
// A farm's calendar is not this. A frost night, a GDD day, a planting date or
// a task's due day is a date at the farm's own location and is never shifted
// into the viewer's zone; those stay date-only strings.

import { formatDate, formatTime } from "@tollbooth-dpyc/web";

const iso = (at: Date | string) => (typeof at === "string" ? at : at.toISOString());

/** "8:28 PM" in `timeZone`. */
export const clockTime = (at: Date | string, timeZone: string): string =>
  formatTime(iso(at), timeZone, { hour: "numeric", minute: "2-digit" });

/** "Sep 25" in `timeZone` — the viewer's day, for an instant that is not today. */
export const clockDay = (at: Date | string, timeZone: string): string =>
  formatDate(iso(at), timeZone, { month: "short", day: "numeric" });
