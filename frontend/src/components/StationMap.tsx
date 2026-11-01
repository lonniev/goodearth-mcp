// The stations round a plot, on the road map. The plot is the green dot and each
// station a honey one. Tapping a station names it under the map's edge, with the
// one button that sets it for this plot.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { BASEMAPS } from "./FieldMap";
import { useEnlarged } from "./MapFrame";
import { EnlargeButton, Pill } from "./ui";
import { fielddataStationsNear } from "../lib/mcp";
import { stationMarkers, type StationMarker } from "../lib/stationMap";

const GROWTH = "#4C7A3D";
const HONEY = "#D99A06";
const INK = "#20301B";
const PAPER = "#FAFAF3";
const REACH_KM = 50;
const ONE_PLACE_ZOOM = 11;

export default function StationMap({ block, currentId, onPick }: {
  block: string;
  currentId: string;
  onPick: (station: StationMarker) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const size = useEnlarged(map);
  const [placeName, setPlaceName] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [tapped, setTapped] = useState<StationMarker | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { tapTolerance: 15, bounceAtZoomLimits: false }).setView([44.48, -73.21], ONE_PLACE_ZOOM);
    L.tileLayer(BASEMAPS.street.url, {
      attribution: BASEMAPS.street.attribution,
      maxZoom: BASEMAPS.street.maxZoom,
    }).addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 0);

    let live = true;
    fielddataStationsNear(block).then(({ place, stations, nearby }) => {
      if (!live) return;
      const markers = stationMarkers(place, stations, nearby, REACH_KM);
      setPlaceName(place.name);
      setCount(markers.length);
      const here: L.LatLngTuple = [place.latitude, place.longitude];
      L.circleMarker(here, { radius: 8, color: PAPER, weight: 2, fillColor: GROWTH, fillOpacity: 1 })
        .bindTooltip(place.name, { permanent: true, direction: "top", offset: [0, -6], className: "plot-label" })
        .addTo(m);
      for (const s of markers) {
        L.circleMarker([s.latitude, s.longitude], {
          radius: 9, color: s.station_id === currentId ? INK : PAPER, weight: s.station_id === currentId ? 3 : 2,
          fillColor: HONEY, fillOpacity: 1,
        })
          .bindTooltip(s.name, { direction: "top", offset: [0, -6], className: "plot-label" })
          .on("click", () => setTapped(s))
          .addTo(m);
      }
      if (markers.length) {
        m.fitBounds(L.latLngBounds([here, ...markers.map((s): L.LatLngTuple => [s.latitude, s.longitude])]), {
          padding: [32, 32], maxZoom: ONE_PLACE_ZOOM,
        });
      } else {
        m.setView(here, ONE_PLACE_ZOOM);
      }
    }).catch((e: Error) => { if (live) setProblem(e.message); });

    return () => { live = false; m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block]);

  return (
    <div className="mt-2 grid gap-1.5">
      <div className={size.frame}>
        <div ref={host} className="h-full w-full" />
        <EnlargeButton big={size.big} onClick={size.toggle} label="the map" />
        {tapped && (
          <div className="absolute inset-x-2 bottom-6 z-[500] flex flex-wrap items-center gap-2 rounded-md bg-panel px-3 py-2 text-[12.5px] shadow">
            <span className="min-w-0 flex-1">
              <b>{tapped.name}</b> <span className="data text-[10.5px] text-ink-soft">{tapped.distance_km.toFixed(1)} km</span>
            </span>
            {tapped.station_id === currentId
              ? <span className="text-ink-soft">This plot's station</span>
              : <Pill active onClick={() => onPick(tapped)}>Use this station</Pill>}
          </div>
        )}
      </div>
      {count === null && !problem && <p role="status" className="animate-pulse text-[12px] text-ink-soft motion-reduce:animate-none">Finding stations…</p>}
      {count === 0 && <p className="text-[12px] text-ink-soft">No published station stands within {REACH_KM} km of {placeName}.</p>}
      {problem && <p role="alert" className="text-[12px] text-clay">{problem}</p>}
    </div>
  );
}
