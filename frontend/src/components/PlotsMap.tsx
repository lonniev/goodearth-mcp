// Every plot the grower has, on one map — and a tap on one works it.
//
// The drawing map below is for adding ground; this one is for finding it. It
// is read-only on purpose: nothing here moves a corner, so a grower can pan
// and tap across the farm without fear of editing it. The active plot is drawn
// in the growth colour, the rest in honey, each labelled with its name.

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { BASEMAPS } from "./FieldMap";
import SunPanel from "./SunPanel";
import { plotShapes } from "../lib/plotShapes";
import type { SavedRegion } from "../lib/regions";
import { cellAt, type SunGrid, type SunView } from "../lib/sunGrid";
import { mountSun, type SunLayer, type SunState } from "../lib/sunOverlay";

const GROWTH = "#4C7A3D";
const HONEY = "#D99A06";

/// The Sun layer as the page drives it: the page owns the state and the
/// answer, the map draws them and reports taps. Absent, the map has no Sun.
export interface SunControl {
  on: boolean;
  onToggle: () => void;
  grid: SunGrid | null;
  loading: boolean;
  error: string;
  state: SunState;
  leafOff: number[];
  tilt: number | null;
  azimuth: number | null;
  onView: (v: SunView) => void;
  onMonth: (m: number) => void;
  onLeaf: (full: boolean) => void;
  onSelect: (cell: number) => void;
}

export default function PlotsMap({ plots, activeId, onPick, sun }: {
  plots: SavedRegion[];
  activeId: string;
  onPick: (r: SavedRegion) => void;
  sun?: SunControl;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.FeatureGroup | null>(null);
  const sunLayer = useRef<SunLayer | null>(null);
  const shapes = useMemo(() => plotShapes(plots), [plots]);
  // The tap handlers are bound once per redraw; read the picker through a ref
  // so a new callback identity does not force one.
  const pick = useRef(onPick);
  pick.current = onPick;
  const sunRef = useRef(sun);
  sunRef.current = sun;
  // Frame the whole farm when the set of plots changes — not when the active
  // one does, or every tap would yank the view away from where it was made.
  const ids = shapes.map((s) => s.id).join(",");
  const framed = useRef("");

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { tapTolerance: 15, bounceAtZoomLimits: false })
      .setView([44.48, -73.21], 13);
    L.tileLayer(BASEMAPS.satellite.url, {
      attribution: BASEMAPS.satellite.attribution,
      maxZoom: BASEMAPS.satellite.maxZoom,
    }).addTo(m);
    drawn.current = L.featureGroup().addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 0);
    // A new map has framed nothing yet, whatever the last one had.
    return () => { m.remove(); map.current = null; framed.current = ""; };
  }, []);

  useEffect(() => {
    const g = drawn.current;
    const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    for (const s of shapes) {
      const active = s.id === activeId;
      const style: L.PathOptions = {
        color: active ? GROWTH : HONEY,
        weight: active ? 3 : 2,
        fillOpacity: active ? 0.22 : 0.1,
      };
      const layer = s.kind === "polygon"
        ? L.polygon(s.ring.map((p) => [p.lat, p.lng] as [number, number]), style)
        : L.circle([s.centre.lat, s.centre.lng], { ...style, radius: s.radiusM });
      layer.bindTooltip(s.name, { permanent: true, direction: "center", className: "plot-label" });
      layer.on("click", (e) => {
        L.DomEvent.stop(e);
        const r = plots.find((p) => p.id === s.id);
        if (r && r.id !== activeId) { pick.current(r); return; }
        // A tap inside the active plot, with the Sun on, is a question about
        // that spot — not a re-pick of ground already active.
        const sc = sunRef.current;
        if (sc?.on && sc.grid) {
          const k = cellAt(sc.grid, e.latlng.lat, e.latlng.lng);
          if (k >= 0) sc.onSelect(k);
        }
      });
      layer.addTo(g);
    }
    if (framed.current !== ids && shapes.length) {
      framed.current = ids;
      // Measure first: on the first pass the container may not have its size
      // yet, and fitting a zero-sized map leaves the farm a speck.
      m.invalidateSize();
      m.fitBounds(g.getBounds(), { padding: [30, 30], maxZoom: 17 });
    }
  }, [shapes, ids, activeId, plots]);

  // ── Sun layer ────────────────────────────────────────────────────────
  const grid = sun?.on ? sun.grid : null;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    sunLayer.current?.remove();
    sunLayer.current = null;
    if (!grid || !sun) return;
    sunLayer.current = mountSun(m, grid, sun.state);
    return () => { sunLayer.current?.remove(); sunLayer.current = null; };
    // The layer is rebuilt only when the grid itself changes; state updates
    // go through update() below, which repaints without a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  useEffect(() => {
    if (sun && grid) sunLayer.current?.update(sun.state);
  }, [sun, grid]);

  return (
    // On a phone the Sun panel sits under the map rather than over it: a
    // 300 px map with a 230 px panel on top is a map you cannot tap.
    <div className="relative rounded-md border border-rule sm:overflow-hidden">
      <div ref={host} className="h-[40vh] min-h-[300px] w-full overflow-hidden rounded-md bg-band" />

      {sun && (
        <button
          onClick={sun.onToggle}
          aria-pressed={sun.on}
          className={`absolute right-2 top-2 z-[400] min-h-11 rounded-md border border-ink/30 px-3 text-[12px] font-medium shadow ${
            sun.on ? "bg-ink text-paper" : "bg-panel/95 text-ink"
          }`}
        >
          ☀️ Sun
        </button>
      )}

      {sun?.on && (
        <SunPanel
          view={sun.state.view} month={sun.state.month} fullLeaf={sun.state.fullLeaf}
          leafOff={sun.leafOff} tilt={sun.tilt} azimuth={sun.azimuth}
          loading={sun.loading} error={sun.error}
          onView={sun.onView} onMonth={sun.onMonth} onLeaf={sun.onLeaf}
        />
      )}
    </div>
  );
}
