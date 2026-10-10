// The guided tour: who sees it, and how a page asks for its own.
//
// `TourProvider` holds the viewing preferences the tour reads and writes.
// A page calls `useTour(page, actions)` once; when this device is due that
// page's tour it starts a moment after the page has painted, and it is taken
// down with the page. `actions` are what a step may ask the page to do first
// — open the add form, pick a tag — by the names the copy uses.
//
// The tour runs for a new device and for anyone who turned "Live tutorial"
// on; a device that was here before the tour existed is left alone. See
// lib/tour/state.ts for the rules and lib/tour/copy.ts for the words.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Prefs } from "../lib/prefs";
import { buildTour } from "../lib/tour";
import { TOURS } from "../lib/tour/copy";
import { markToured, replayPage, shouldRun, stopAll } from "../lib/tour/state";
import type { TourPage } from "../lib/tour/types";
import type { ViewKey } from "../lib/views";
import { ICON, IconButton } from "./ui";

interface TourContext {
  prefs: Prefs;
  update(change: (p: Prefs) => Prefs): void;
}

const Ctx = createContext<TourContext | null>(null);

export function TourProvider({ prefs, onChange, children }: {
  prefs: Prefs;
  onChange: (p: Prefs) => void;
  children: ReactNode;
}) {
  // The latest prefs and setter, read at the moment of a change rather than
  // at the moment the hook was bound: two steps ending in one frame must both
  // land. `update` itself never changes identity — a page's effect depends
  // on it, and a fresh function each render would restart the tour each
  // render.
  const latest = useRef({ prefs, onChange });
  latest.current = { prefs, onChange };
  const update = useCallback((change: (p: Prefs) => Prefs) => {
    const next = change(latest.current.prefs);
    latest.current = { ...latest.current, prefs: next };
    latest.current.onChange(next);
  }, []);
  const value = useMemo<TourContext>(() => ({ prefs, update }), [prefs, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type TourActions = Record<string, () => void | Promise<void>>;

/// Ask for this page's tour, if this device is due it.
export function useTour(page: TourPage, actions?: TourActions, ready = true) {
  const ctx = useContext(Ctx);
  const acts = useRef(actions);
  acts.current = actions;
  const due = ctx ? shouldRun(ctx.prefs, page) : false;
  const update = ctx?.update;

  useEffect(() => {
    if (!due || !ready || !update) return;
    let cancelled = false;
    let run: ReturnType<typeof buildTour> | null = null;
    // A moment after paint: the page's first row of controls is there and
    // the layout has settled, so the cutout lands on the thing it names.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      run = buildTour(TOURS[page], {
        run: (name) => acts.current?.[name]?.(),
        onEnd: () => update((p) => markToured(p, page)),
        onStop: () => update(stopAll),
      });
      run.start();
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); run?.stop(true); };
  }, [page, due, ready, update]);
}

/// "Show me on the page", on a guide: that page's tour once more.
export function TourButton({ page, onView }: {
  page: Extract<TourPage, ViewKey>;
  onView: (v: ViewKey) => void;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <IconButton path={ICON.explore} label="Show me on the page" tone="quiet"
      title="Walk me through the page itself"
      onClick={() => { ctx.update((p) => replayPage(p, page)); onView(page); }} />
  );
}
