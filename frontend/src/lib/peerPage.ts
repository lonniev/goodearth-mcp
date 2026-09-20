// The page a reader is most likely to go to next, and the one call that makes
// it appear.
//
// The Dashboard and the Almanac are two readings of the same week — heat on
// one, sky on the other — and a grower checking the season reads both. Each
// one is a paid call that starts when the view mounts, so flipping between
// them means waiting twice for answers that could have been fetched at once.
//
// So the page being looked at names its peer, the peer's headline call is
// started in the background, and by the time the reader taps across it is
// already in hand.
//
// **Only the headline call.** The Dashboard also reads frost, soil, disease
// and drying for the cards under the chart, and warming all five would spend
// five fares on a page nobody has asked for yet. The chart is what the page
// IS; the cards arrive under it as they always did.

export type Warmable = "ledger" | "almanac";

const PEER: Record<Warmable, Warmable> = {
  ledger: "almanac",
  almanac: "ledger",
};

/// The page to warm while `view` is on screen, or null if there is nothing
/// worth warming from here. Most views have no peer: a reader on My Plots is
/// not half way to anywhere in particular.
export function peerOf(view: string): Warmable | null {
  return (PEER as Record<string, Warmable | undefined>)[view] ?? null;
}

/// How long to wait before warming.
///
/// Not zero. The page in front of the reader is asking for its own answers
/// right now, and a sixth call thrown in beside them competes for the same
/// connection and the same upstream quota — the burst this service already
/// had to learn not to make. The peer is wanted SOON, not first, so it goes
/// out once the current page has had the network to itself for a moment.
export const WARM_AFTER_MS = 1_500;

/// Enough of a plot to name a reading of it.
export interface Ground {
  id: string;
  baseTempF: number;
}

/// What a page's held answer is filed under.
///
/// Lives here, next to the page names and away from the calls, so that the
/// view reading a key and the warm filling one cannot drift apart — and so
/// that it can be tested without dragging the MCP client in behind it.
///
/// The base temperature is in the Dashboard's key because it is in the
/// question: the same ground at base 50 and at base 40 are two different
/// curves, and a grower who changes it must not be handed the old one. The
/// sky has no base temperature, so the Almanac's key has none either.
export function pageKey(page: Warmable, ground: Ground): string {
  return page === "ledger"
    ? `ledger|${ground.id}|${ground.baseTempF}`
    : `almanac|${ground.id}`;
}
