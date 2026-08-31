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
// 5. **Touch first.** This is used on a tablet in a field, not a desktop with
//    a mouse. Corners are draggable Leaflet markers (which handle touch, pen
//    and mouse natively) rather than hand-rolled mouse handlers, their hit area
//    is a 44 px finger target around a 12 px dot, and every control on the map
//    meets the same minimum. Nothing important is behind a hover.
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

// 44 px is the smallest reliable finger target. The visible dot stays small so
// it does not hide the field underneath; the hit area around it does the work.
const TOUCH = 44;
const DOT = 12;

function cornerIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [TOUCH, TOUCH],
    iconAnchor: [TOUCH / 2, TOUCH / 2],
    html:
      `<div style="width:${TOUCH}px;height:${TOUCH}px;display:flex;align-items:center;` +
      `justify-content:center;touch-action:none;cursor:grab;">` +
      `<div style="width:${DOT}px;height:${DOT}px;border-radius:50%;background:${GROWTH};` +
      `border:2px solid #FAFAF3;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div></div>`,
  });
}

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [TOUCH, TOUCH],
    iconAnchor: [TOUCH / 2, TOUCH / 2],
    html:
      `<div style="width:${TOUCH}px;height:${TOUCH}px;display:flex;align-items:center;` +
      `justify-content:center;touch-action:none;cursor:grab;">` +
      `<div style="width:14px;height:14px;border-radius:50%;background:${HONEY};` +
      `border:2px solid #FAFAF3;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div></div>`,
  });
}

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
    const m = L.map(host.current, {
      zoomControl: true,
      attributionControl: true,
      // Pinch to zoom, one finger to pan. A generous tap tolerance keeps a
      // slightly-moving finger from being read as a drag instead of a tap.
      touchZoom: true,
      tapTolerance: 15,
      bounceAtZoomLimits: false,
    }).setView([44.48, -73.21], 13);
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
      // Corners are draggable Leaflet markers, not hand-rolled mouse
      // handlers: L.Marker's drag support covers touch, pen and mouse, where
      // mousedown/mousemove never fire from a finger. The icon carries a 44 px
      // hit area around a 12 px dot so a corner is grabbable without zooming in.
      value.ring.forEach((p, i) => {
        const mk = L.marker([p.lat, p.lng], {
          draggable: true,
          keyboard: false,
          icon: cornerIcon(),
          // Keep the finger's contact point on the corner rather than above it.
          autoPanOnFocus: false,
        }).addTo(g);

        mk.on("drag", (ev) => {
          const { value: v, onChange: cb } = latest.current;
          const ll = (ev.target as L.Marker).getLatLng();
          const next = [...v.ring];
          next[i] = { lat: ll.lat, lng: ll.lng };
          cb({ ...v, ring: next });
        });

        // Tapping a corner removes it — the touch equivalent of the undo
        // button, reachable without hunting for the most recent one.
        mk.on("click", (ev) => {
          L.DomEvent.stop(ev);
          const { value: v, onChange: cb } = latest.current;
          if (v.ring.length <= 1) { cb({ ...v, ring: [] }); return; }
          cb({ ...v, ring: v.ring.filter((_, j) => j !== i) });
        });
      });
    } else if (value.centre) {
      L.circle([value.centre.lat, value.centre.lng], {
        radius: value.radiusM, color: GROWTH, weight: 2.5, fillOpacity: 0.15,
      }).addTo(g);
      // The pin is draggable too — nudging a centre by a field's width should
      // not mean tapping again and losing the radius.
      const pin = L.marker([value.centre.lat, value.centre.lng], {
        draggable: true, keyboard: false, icon: pinIcon(),
      }).addTo(g);
      pin.on("drag", (ev) => {
        const { value: v, onChange: cb } = latest.current;
        const ll = (ev.target as L.Marker).getLatLng();
        cb({ ...v, centre: { lat: ll.lat, lng: ll.lng } });
      });
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
            className={`min-h-11 px-4 font-medium ${layer === k ? "bg-ink text-paper" : "text-ink active:bg-band"}`}>
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
