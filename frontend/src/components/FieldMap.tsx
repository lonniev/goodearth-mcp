// The drawing map — how a grower tells Good Earth what ground to answer for.
//
// Design intent, in priority order:
//
// 1. **Satellite first.** A farmer recognises their fields from the air, not
//    from a road map. Imagery is the default layer; the street map is there to
//    find the road you turned off.
// 2. **Acreage as you draw.** The number that tells a grower the polygon is
//    right is the one already in their field book. It updates on every vertex,
//    in acres AND hectares, because their paperwork uses one and the data grid
//    uses the other.
// 3. **Forgiving.** Undo the last corner, drag any corner to fix it, start
//    over — all without leaving the map or losing the view.
// 4. **Find the farm fast.** Search by address or place, or use the device's
//    own location. Panning from a world view to a hedgerow is nobody's idea of
//    an interface.
//
// Basemap is Leaflet + open tiles: no key, no billing, works tonight. The
// layer definitions are isolated in BASEMAPS so a Google Maps key delivered
// via Secure Courier can swap them without touching the drawing logic.

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  areaM2, distanceM, formatArea, isDrawable, type LatLng,
} from "../lib/geo";

export type DrawMode = "polygon" | "pin";

export interface MapValue {
  mode: DrawMode;
  ring: LatLng[];
  centre: LatLng | null;
  radiusM: number;
}

interface Props {
  value: MapValue;
  onChange: (v: MapValue) => void;
  /// Saved blocks, drawn faintly so a new one can be placed beside them.
  others?: { name: string; ring: LatLng[] }[];
  centreOn?: LatLng | null;
}

const BASEMAPS = {
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  street: {
    label: "Map",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  },
} as const;

const GROWTH = "#4C7A3D";
const HONEY = "#D99A06";
const INK = "#20301B";

export default function FieldMap({ value, onChange, others = [], centreOn }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const drawn = useRef<L.LayerGroup | null>(null);
  const [layer, setLayer] = useState<keyof typeof BASEMAPS>("satellite");

  // The callback the map handlers close over must always be current, or a
  // click three renders later commits to a stale ring.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  // ── Map lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { zoomControl: true, attributionControl: true })
      .setView([44.48, -73.21], 13);
    tiles.current = L.tileLayer(BASEMAPS.satellite.url, {
      attribution: BASEMAPS.satellite.attribution,
      maxZoom: BASEMAPS.satellite.maxZoom,
    }).addTo(m);
    drawn.current = L.layerGroup().addTo(m);

    m.on("click", (e: L.LeafletMouseEvent) => {
      const { value: v, onChange: cb } = latest.current;
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (v.mode === "polygon") cb({ ...v, ring: [...v.ring, p] });
      else cb({ ...v, centre: p });
    });

    map.current = m;
    // Leaflet measures its container on creation; in a flex/grid parent that
    // size is often still zero, leaving a grey map until the first resize.
    setTimeout(() => m.invalidateSize(), 0);
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !tiles.current) return;
    const b = BASEMAPS[layer];
    tiles.current.setUrl(b.url);
    tiles.current.options.attribution = b.attribution;
  }, [layer]);

  useEffect(() => {
    if (map.current && centreOn) map.current.setView([centreOn.lat, centreOn.lng], 15);
  }, [centreOn]);

  // ── Redraw ───────────────────────────────────────────────────────────
  useEffect(() => {
    const g = drawn.current;
    if (!g || !map.current) return;
    g.clearLayers();

    for (const o of others) {
      if (o.ring.length < 3) continue;
      L.polygon(o.ring.map((p) => [p.lat, p.lng] as [number, number]), {
        color: INK, weight: 1, opacity: 0.45, fillOpacity: 0.05, dashArray: "4 4",
        interactive: false,
      }).addTo(g);
    }

    if (value.mode === "polygon") {
      const pts = value.ring.map((p) => [p.lat, p.lng] as [number, number]);
      if (pts.length >= 3) {
        L.polygon(pts, { color: GROWTH, weight: 2.5, fillOpacity: 0.18 }).addTo(g);
      } else if (pts.length === 2) {
        L.polyline(pts, { color: GROWTH, weight: 2.5, dashArray: "5 4" }).addTo(g);
      }
      // Corners are draggable — fixing a misplaced vertex must never mean
      // redrawing the whole block.
      value.ring.forEach((p, i) => {
        const h = L.circleMarker([p.lat, p.lng], {
          radius: 6, color: "#FAFAF3", weight: 2, fillColor: GROWTH, fillOpacity: 1,
        }).addTo(g);
        h.on("mousedown", () => {
          const m = map.current!;
          m.dragging.disable();
          const move = (ev: L.LeafletMouseEvent) => {
            const { value: v, onChange: cb } = latest.current;
            const next = [...v.ring];
            next[i] = { lat: ev.latlng.lat, lng: ev.latlng.lng };
            cb({ ...v, ring: next });
          };
          const up = () => {
            m.off("mousemove", move); m.off("mouseup", up); m.dragging.enable();
          };
          m.on("mousemove", move); m.on("mouseup", up);
        });
      });
    } else if (value.centre) {
      L.circle([value.centre.lat, value.centre.lng], {
        radius: value.radiusM, color: GROWTH, weight: 2.5, fillOpacity: 0.15,
      }).addTo(g);
      L.circleMarker([value.centre.lat, value.centre.lng], {
        radius: 5, color: "#FAFAF3", weight: 2, fillColor: HONEY, fillOpacity: 1,
      }).addTo(g);
    }
  }, [value, others]);

  const fit = useCallback(() => {
    const m = map.current;
    if (!m) return;
    if (value.mode === "polygon" && value.ring.length >= 2) {
      m.fitBounds(L.latLngBounds(value.ring.map((p) => [p.lat, p.lng])), { padding: [40, 40] });
    } else if (value.centre) {
      m.fitBounds(L.circle([value.centre.lat, value.centre.lng], { radius: value.radiusM }).getBounds(),
        { padding: [40, 40] });
    }
  }, [value]);

  return (
    <div className="relative overflow-hidden rounded-md border border-rule">
      <div ref={host} className="h-[52vh] min-h-[340px] w-full bg-band" />

      {/* Layer toggle — satellite is the default because a grower recognises
          fields from the air, not from a road map. */}
      <div className="absolute right-2 top-2 z-[400] flex overflow-hidden rounded-md border border-ink/30 bg-panel/95 text-[11.5px] shadow">
        {(Object.keys(BASEMAPS) as (keyof typeof BASEMAPS)[]).map((k) => (
          <button key={k} onClick={() => setLayer(k)}
            className={`px-2.5 py-1 font-medium ${layer === k ? "bg-ink text-paper" : "text-ink hover:bg-band"}`}>
            {BASEMAPS[k].label}
          </button>
        ))}
      </div>

      <MapReadout value={value} onFit={fit} />
    </div>
  );
}

/// The number that tells a grower the polygon is right. Sits on the map, not
/// beside it, so the eye never leaves the field while drawing.
function MapReadout({ value, onFit }: { value: MapValue; onFit: () => void }) {
  const m2 =
    value.mode === "polygon"
      ? isDrawable(value.ring) ? areaM2(value.ring) : 0
      : value.centre ? Math.PI * value.radiusM ** 2 : 0;

  const perimeter =
    value.mode === "polygon" && value.ring.length >= 2
      ? value.ring.reduce((sum, p, i) =>
          sum + (i === 0 ? 0 : distanceM(value.ring[i - 1], p)), 0)
        + (value.ring.length >= 3 ? distanceM(value.ring[value.ring.length - 1], value.ring[0]) : 0)
      : 0;

  if (!m2) {
    return (
      <div className="absolute bottom-2 left-2 z-[400] rounded-md border border-ink/25 bg-panel/95 px-3 py-1.5 text-[12px] text-ink-soft shadow">
        {value.mode === "polygon"
          ? "Click each corner of the block. Three corners and it has an area."
          : "Click the middle of the block, then set the radius."}
      </div>
    );
  }

  return (
    <div className="absolute bottom-2 left-2 z-[400] rounded-md border border-ink/25 bg-panel/95 px-3 py-2 shadow">
      <div className="figure text-[17px] leading-none">{formatArea(m2)}</div>
      <div className="data mt-1 text-[10px] text-ink-soft">
        {value.mode === "polygon"
          ? `${value.ring.length} corners · ${Math.round(perimeter).toLocaleString()} m around`
          : `${value.radiusM.toLocaleString()} m radius`}
        {" · "}
        <button onClick={onFit} className="underline hover:text-ink">fit</button>
      </div>
    </div>
  );
}
