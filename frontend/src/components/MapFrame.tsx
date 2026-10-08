// Enlarging a map's frame to the whole screen, and shrinking it back.
//
// Both maps — the plots on My Plots, the rain on the Almanac — sit in a box
// two-fifths of the screen tall, which is right for the page and small for
// the ground. The button under Leaflet's zoom control lets the frame grow
// to the screen's edges; the same button, or Escape, brings it back. It is
// the frame that grows, not the zoom: the map keeps its view.
//
// The size lives on the frame round the map, never on the element Leaflet
// owns: React writes that element's whole class attribute on a re-render,
// which wipes the `leaflet-container` class Leaflet put there — and under
// that class Leaflet's CSS lets tiles keep their size; without it Tailwind's
// image reset gives each tile max-width 100% of a zero-width pane. The
// grower saw the plots drawn on blank ground.

import { useCallback, useEffect, useState, type RefObject } from "react";
import type L from "leaflet";
import { ICON } from "./ui";

export function useEnlarged(map: RefObject<L.Map | null>) {
  const [big, setBig] = useState(false);
  const toggle = useCallback(() => setBig((v) => !v), []);

  useEffect(() => {
    // The map must re-measure its box once the frame has changed size.
    const t = setTimeout(() => map.current?.invalidateSize(), 0);
    if (!big) return () => clearTimeout(t);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(false); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [big, map]);

  return {
    big,
    toggle,
    /// The frame round the map, which carries the size; the map's own
    /// element is `h-full w-full` and its classes never change.
    frame: big
      ? "fixed inset-0 z-[1000] bg-paper"
      : "relative h-[40vh] min-h-[300px] overflow-hidden rounded-md border border-rule",
  };
}

/// The enlarge button, under the zoom control at the map's top-left.
export function EnlargeButton({ big, onClick }: { big: boolean; onClick: () => void }) {
  const title = big ? "Shrink the map" : "Enlarge the map";
  return (
    <button
      onClick={onClick}
      aria-pressed={big}
      aria-label={title}
      title={title}
      className={`absolute left-[10px] top-[108px] z-[400] flex h-11 w-11 items-center justify-center rounded-md border border-ink/30 shadow ${
        big ? "bg-ink text-paper" : "bg-panel/95 text-ink"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d={big ? ICON.collapse : ICON.expand} />
      </svg>
    </button>
  );
}
