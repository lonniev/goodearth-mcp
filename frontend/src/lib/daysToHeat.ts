// A seed packet's days to maturity, turned into a heat target by the server
// (`heat_for_days`). Almost nobody publishes a degree-day target for a
// cultivar, and a guessed one quietly wrecks every date the ledger gives; the
// packet's days are on nearly every packet.
//
// The rules the form needs, kept pure so they can be tested.

/// The server's range: under two weeks is not a crop with a heat target, and
/// over a year is not one season's packet.
export const MIN_DAYS = 14, MAX_DAYS = 365;

/// The packet's days, or null when the field does not hold a usable count.
export function packetDays(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= MIN_DAYS && n <= MAX_DAYS ? n : null;
}

/// May the page write a target into the field? Only when it is empty, or still
/// holds the figure the page itself wrote last. A number the grower typed is
/// theirs, and is never overwritten.
export function mayFill(current: string, lastFilled: string): boolean {
  const t = current.trim();
  return t === "" || t === lastFilled;
}
