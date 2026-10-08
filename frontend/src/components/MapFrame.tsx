// Framing a map on one thing, and knowing when the grower has left it.
//
// Both maps — the plots on My Plots, the rain on the Almanac — open wide and
// have one thing on them worth framing. The button sits under Leaflet's own
// zoom control, where the eye already looks for the map's controls; pressed
// again it frames the wide view, and any pan or pinch of the grower's own
// releases it.

import { useCallback, useRef, useState } from "react";
import L from "leaflet";
import { ICON } from "./ui";

export function useMapFrame() {
  /// Whether the view is the thing's frame — pressed on the button.
  const [onThing, setOnThing] = useState(false);
  const ours = useRef(false);

  /// Hook the map so a move the grower makes leaves the frame; ours do not.
  const watch = useCallback((m: L.Map) => {
    m.on("movestart", () => { if (!ours.current) setOnThing(false); });
  }, []);

  const fit = useCallback((m: L.Map, bounds: L.LatLngBounds, thing: boolean, maxZoom: number) => {
    if (!bounds.isValid()) return;
    // Measure first: the container may not have its size yet, and fitting
    // a zero-sized map leaves the farm a speck.
    m.invalidateSize();
    ours.current = true;
    m.fitBounds(bounds, { padding: [30, 30], maxZoom });
    setTimeout(() => { ours.current = false; }, 0);
    setOnThing(thing);
  }, []);

  const view = useCallback((m: L.Map, centre: L.LatLngExpression, zoom: number, thing: boolean) => {
    ours.current = true;
    m.setView(centre, zoom);
    setTimeout(() => { ours.current = false; }, 0);
    setOnThing(thing);
  }, []);

  return { onThing, watch, fit, view };
}

/// The frame button, under the zoom control at the map's top-left.
export function FrameButton({ pressed, label, wideLabel, onClick }: {
  pressed: boolean;
  /// What a press frames, e.g. "Frame Lower Meadow".
  label: string;
  /// What a press frames once pressed, e.g. "Frame the whole farm".
  wideLabel: string;
  onClick: () => void;
}) {
  const title = pressed ? wideLabel : label;
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={title}
      title={title}
      className={`absolute left-[10px] top-[108px] z-[400] flex h-11 w-11 items-center justify-center rounded-md border border-ink/30 shadow ${
        pressed ? "bg-ink text-paper" : "bg-panel/95 text-ink"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d={ICON.frame} /></svg>
    </button>
  );
}
