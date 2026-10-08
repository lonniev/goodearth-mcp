// The rain, on a map of the block's region: RainViewer's last two hours and
// the minutes ahead, played or scrubbed.
//
// Radar is a regional picture — RainViewer serves it to zoom 7, where a farm
// is a dot — so the map opens on the country round the block, marks the
// block, and the grower zooms to the ground only if they want to. The
// controls sit under the map, as the Sun's do, so nothing hides the rain.

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { useTimezone } from "@tollbooth-dpyc/web/react";
import { BASEMAPS } from "./FieldMap";
import { EnlargeButton, useEnlarged } from "./MapFrame";
import { coverageLabel, fetchRadarIndex, frameLabel, RADAR_MAX_NATIVE_ZOOM, tileUrl, type RadarIndex } from "../lib/radar";
import { plotShapes } from "../lib/plotShapes";
import type { SavedRegion } from "../lib/regions";

const GROWTH = "#4C7A3D";
/// Wide enough to see weather coming: a couple of hundred kilometres across.
const REGION_ZOOM = 8;

export default function RadarMap({ region }: { region: SavedRegion }) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.LayerGroup | null>(null);
  const radarLayer = useRef<L.TileLayer | null>(null);
  const [radar, setRadar] = useState<RadarIndex | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState("");
  const [, zone] = useTimezone();
  const shape = useMemo(() => plotShapes([region])[0], [region]);
  const size = useEnlarged(map);

  // ── Map lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { tapTolerance: 15, bounceAtZoomLimits: false })
      .setView([44.48, -73.21], REGION_ZOOM);
    // The road map, not the satellite: rain reads against pale ground and
    // named towns, and a dark forest from the air swallows light drizzle.
    L.tileLayer(BASEMAPS.street.url, {
      attribution: BASEMAPS.street.attribution,
      maxZoom: BASEMAPS.street.maxZoom,
    }).addTo(m);
    drawn.current = L.layerGroup().addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 0);
    return () => { m.remove(); map.current = null; radarLayer.current = null; };
  }, []);

  // The block: its shape for when the grower zooms in, and a dot for the
  // regional view, where the shape is smaller than the line that draws it.
  useEffect(() => {
    const g = drawn.current;
    const m = map.current;
    if (!g || !m || !shape) return;
    g.clearLayers();
    const style: L.PathOptions = { color: GROWTH, weight: 3, fillOpacity: 0.22 };
    const layer = shape.kind === "polygon"
      ? L.polygon(shape.ring.map((p) => [p.lat, p.lng] as [number, number]), style)
      : L.circle([shape.centre.lat, shape.centre.lng], { ...style, radius: shape.radiusM });
    layer.addTo(g);
    const centre = layer.getBounds().getCenter();
    L.circleMarker(centre, { radius: 6, color: "#FAFAF3", weight: 2, fillColor: GROWTH, fillOpacity: 1 })
      .bindTooltip(shape.name, { permanent: true, direction: "top", offset: [0, -6], className: "plot-label" })
      .addTo(g);
    m.setView(centre, REGION_ZOOM);
  }, [shape]);

  // ── Radar ────────────────────────────────────────────────────────────
  // RainViewer's index: the frames on offer. Once per mount — the index
  // turns over every ten minutes, and the page is reopened more often.
  useEffect(() => {
    const ac = new AbortController();
    fetchRadarIndex(ac.signal)
      .then((idx) => { setRadar(idx); setFrame(idx.frames.length - 1); setErr(""); })
      .catch((e) => { if (e.name !== "AbortError") setErr(e.message); });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !radar) return;
    const f = radar.frames[Math.min(frame, radar.frames.length - 1)];
    if (!f) return;
    const next = L.tileLayer(tileUrl(radar, f), {
      opacity: 0.62,
      zIndex: 400,
      // Without this the layer asks for tiles above what RainViewer serves and
      // gets a "Zoom level not supported" placeholder back with a 200.
      maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
    });
    next.addTo(m);
    // Swap rather than mutate: replacing the URL on a live layer leaves the
    // old tiles visible until each one is refetched, which reads as a stutter.
    const prev = radarLayer.current;
    radarLayer.current = next;
    if (prev) next.once("load", () => m.removeLayer(prev));
  }, [radar, frame]);

  useEffect(() => {
    if (!playing || !radar) return;
    const id = setInterval(() => setFrame((i) => (i + 1) % radar.frames.length), 450);
    return () => clearInterval(id);
  }, [playing, radar]);

  return (
    // Enlarged, the player rides inside the frame under the map, so the rain
    // can still be played across the whole screen.
    <div className={size.big ? "fixed inset-0 z-[1000] flex flex-col bg-paper" : "mb-4"}>
      <div className={size.big ? "relative min-h-0 flex-1" : "relative h-[40vh] min-h-[280px] overflow-hidden rounded-md border border-rule"}>
        {/* Sized by the frame; its own classes never change (see MapFrame). */}
        <div ref={host} className="h-full w-full bg-band" />
        <EnlargeButton big={size.big} onClick={size.toggle} />
      </div>
      <div className={`border-rule bg-panel px-3 py-2 ${size.big ? "border-t" : "mt-2 rounded-md border"}`}>
        {err ? (
          <p className="text-[12px] text-clay">{err}</p>
        ) : !radar ? (
          <p className="text-[12px] text-ink-soft">Loading radar…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause radar" : "Play radar"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-rule text-[15px] active:bg-band">
              {playing ? "⏸" : "▶"}
            </button>
            <input
              type="range" min={0} max={radar.frames.length - 1} value={frame}
              onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }}
              aria-label="Radar time"
              className="h-11 min-w-[12rem] flex-1 accent-[color:var(--color-frost)]"
            />
            <span className="data w-[4.5rem] shrink-0 text-[12px]">
              {frameLabel(radar.frames[Math.min(frame, radar.frames.length - 1)], zone)}
            </span>
            <p className="data text-[10.5px] leading-snug text-ink-soft">{coverageLabel(radar)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
