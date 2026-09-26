// Every plot the grower has, on one map — and a tap on one works it.
//
// The drawing map below is for adding ground; this one is for finding it. It
// is read-only on purpose: nothing here moves a corner, so a grower can pan
// and tap across the farm without fear of editing it. The active plot is drawn
// in the growth colour, the rest in honey, each labelled with its name.

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { BASEMAPS } from "./FieldMap";
import { plotShapes } from "../lib/plotShapes";
import type { SavedRegion } from "../lib/regions";

const GROWTH = "#4C7A3D";
const HONEY = "#D99A06";

export default function PlotsMap({ plots, activeId, onPick }: {
  plots: SavedRegion[];
  activeId: string;
  onPick: (r: SavedRegion) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.FeatureGroup | null>(null);
  const shapes = useMemo(() => plotShapes(plots), [plots]);
  // The tap handlers are bound once per redraw; read the picker through a ref
  // so a new callback identity does not force one.
  const pick = useRef(onPick);
  pick.current = onPick;
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
        if (r && r.id !== activeId) pick.current(r);
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

  return (
    <div className="overflow-hidden rounded-md border border-rule">
      <div ref={host} className="h-[40vh] min-h-[300px] w-full bg-band" />
    </div>
  );
}
