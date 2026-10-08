// Every plot the grower has, on one map — and a tap on one works it.
//
// The drawing map below is for adding ground; this one is for finding it. It
// is read-only on purpose: nothing here moves a corner, so a grower can pan
// and tap across the farm without fear of editing it. The active plot is drawn
// in the growth colour, the rest in honey, each labelled with its name.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { BASEMAPS } from "./FieldMap";
import { ICON } from "./ui";
import { plotShapes } from "../lib/plotShapes";
import type { SavedRegion } from "../lib/regions";
import { cellAt, type SunGrid } from "../lib/sunGrid";
import { mountSun, type SunLayer, type SunState } from "../lib/sunOverlay";

const GROWTH = "#4C7A3D";
const HONEY = "#D99A06";

/// The Sun layer as the map needs it: the page owns the state, the answer
/// and the controls; the map draws the grid and reports taps. Absent, the
/// map has no Sun.
export interface SunControl {
  on: boolean;
  onToggle: () => void;
  grid: SunGrid | null;
  state: SunState;
  onSelect: (cell: number) => void;
}

export default function PlotsMap({ plots, activeId, onPick, sun, focus = 0 }: {
  plots: SavedRegion[];
  activeId: string;
  onPick: (r: SavedRegion) => void;
  sun?: SunControl;
  /// A request to frame the active plot; each change is one request.
  focus?: number;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.FeatureGroup | null>(null);
  const layers = useRef(new Map<string, L.Polygon | L.Circle>());
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
  /// Whether the view is the active plot's frame — pressed on the button
  /// below, and cleared by any pan or pinch the grower makes.
  const [onPlot, setOnPlot] = useState(false);
  const ours = useRef(false);

  const fit = useCallback((bounds: L.LatLngBounds, plot: boolean) => {
    const m = map.current;
    if (!m || !bounds.isValid()) return;
    // Measure first: the container may not have its size yet, and fitting
    // a zero-sized map leaves the farm a speck.
    m.invalidateSize();
    ours.current = true;
    m.fitBounds(bounds, { padding: [30, 30], maxZoom: plot ? BASEMAPS.satellite.maxZoom : 17 });
    setTimeout(() => { ours.current = false; }, 0);
    setOnPlot(plot);
  }, []);
  const frameFarm = useCallback(() => { if (drawn.current) fit(drawn.current.getBounds(), false); }, [fit]);
  const framePlot = useCallback(() => {
    const l = layers.current.get(activeId);
    if (l) fit(l.getBounds(), true);
  }, [activeId, fit]);

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { tapTolerance: 15, bounceAtZoomLimits: false })
      .setView([44.48, -73.21], 13);
    L.tileLayer(BASEMAPS.satellite.url, {
      attribution: BASEMAPS.satellite.attribution,
      maxZoom: BASEMAPS.satellite.maxZoom,
    }).addTo(m);
    drawn.current = L.featureGroup().addTo(m);
    // A move the grower makes leaves the plot's frame; one of ours does not.
    m.on("movestart", () => { if (!ours.current) setOnPlot(false); });
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
    layers.current.clear();
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
      layers.current.set(s.id, layer);
    }
    if (framed.current !== ids && shapes.length) {
      framed.current = ids;
      fit(g.getBounds(), false);
    }
  }, [shapes, ids, activeId, plots, fit]);

  // The page asks for the active plot's frame: the chip tapped again.
  useEffect(() => { if (focus > 0) framePlot(); }, [focus, framePlot]);

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

  const activeName = plots.find((p) => p.id === activeId)?.name ?? "the plot";
  const shell = "min-h-11 rounded-md border border-ink/30 shadow";

  return (
    <div className="relative overflow-hidden rounded-md border border-rule">
      <div ref={host} className="h-[40vh] min-h-[300px] w-full overflow-hidden rounded-md bg-band" />

      <div className="absolute right-2 top-2 z-[400] flex gap-1.5">
        {/* Frame the plot being worked; pressed, the same tap frames the
            whole farm again. The map opens on the farm, so a plot inside
            it needs no pinching to be seen. */}
        <button
          onClick={onPlot ? frameFarm : framePlot}
          aria-pressed={onPlot}
          aria-label={onPlot ? "Frame the whole farm" : `Frame ${activeName}`}
          title={onPlot ? "Frame the whole farm" : `Frame ${activeName}`}
          className={`${shell} flex w-11 items-center justify-center ${onPlot ? "bg-ink text-paper" : "bg-panel/95 text-ink"}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d={ICON.frame} /></svg>
        </button>
        {sun && (
          <button
            onClick={sun.onToggle}
            aria-pressed={sun.on}
            className={`${shell} px-3 text-[12px] font-medium ${sun.on ? "bg-ink text-paper" : "bg-panel/95 text-ink"}`}
          >
            ☀️ Sun
          </button>
        )}
      </div>
    </div>
  );
}
