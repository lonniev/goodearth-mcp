// Who sees a tour, and when it stops.
//
// Three facts, kept in the viewing preferences per device: whether the
// live tutorial is on, which pages have had their tour, and a page asked
// to replay once from its guide. A new device starts with the tutorial on;
// a device that already held preferences from before the tour existed
// starts with it off — a grower who has been here for a season is shown
// nothing until they ask.

export interface TourPrefs {
  tour: boolean;
  toured: Record<string, true>;
  /// A page asked to show its tour once more from its guide, whatever the
  /// switch says. Cleared when that tour ends.
  replay: string | null;
}

export const TOUR_DEFAULTS: TourPrefs = { tour: true, toured: {}, replay: null };

/// Should this page's tour run now?
export function shouldRun(p: TourPrefs, page: string): boolean {
  if (p.replay === page) return true;
  return p.tour && !p.toured[page];
}

/// The page's tour ended — by its last step or by its ✕. Either way it is
/// done for this device.
export function markToured<P extends TourPrefs>(p: P, page: string): P {
  return { ...p, toured: { ...p.toured, [page]: true }, replay: p.replay === page ? null : p.replay };
}

/// "Stop the tutorial", from any popover: off everywhere.
export function stopAll<P extends TourPrefs>(p: P): P {
  return { ...p, tour: false, replay: null };
}

/// The switch turned on in the profile: every page shows its tour again.
export function replayAll<P extends TourPrefs>(p: P): P {
  return { ...p, tour: true, toured: {}, replay: null };
}

/// "Show me on the page", from a guide: that page once more, and only it.
export function replayPage<P extends TourPrefs>(p: P, page: string): P {
  const toured = { ...p.toured };
  delete toured[page];
  return { ...p, toured, replay: page };
}

/// What stored preferences from before the tour existed should read as.
/// `raw` is what was in storage; a device with none is new and gets the
/// defaults, one with some is an old hand and is left in peace.
export function fromStored(raw: Partial<TourPrefs> | null): TourPrefs {
  if (raw == null) return { ...TOUR_DEFAULTS };
  const toured = raw.toured && typeof raw.toured === "object"
    ? Object.fromEntries(Object.entries(raw.toured).filter(([, v]) => v === true)) as Record<string, true>
    : {};
  return {
    tour: typeof raw.tour === "boolean" ? raw.tour : false,
    toured,
    replay: typeof raw.replay === "string" ? raw.replay : null,
  };
}
