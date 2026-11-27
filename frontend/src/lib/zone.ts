// The reader's clock, said once.
//
// A grower picks a time zone in Preferences. "Today", the Almanac's days and
// every date a form fills in for them run on that zone. The browser's own
// clock and Greenwich's are both wrong for someone reading a farm from
// elsewhere, and UTC already says "tomorrow" after 7 pm in Vermont.

import { readTimezonePref, resolveTimeZone } from "@tollbooth-dpyc/web";

/// The IANA zone the reader chose in Preferences, or their browser's.
export function viewerZone(): string {
  return resolveTimeZone(readTimezonePref());
}

/// `at` as a YYYY-MM-DD calendar day on the reader's clock.
export function isoDay(at: Date = new Date(), zone: string = viewerZone()): string {
  return at.toLocaleDateString("en-CA", { timeZone: zone });
}
