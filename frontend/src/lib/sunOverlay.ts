// The Sun layer on a Leaflet map: one image over the block's bounds, repainted
// from the decoded grid whenever the month, the view or the leaf state moves.
//
// An `L.imageOverlay` rather than a tile layer, because the grid IS a small
// raster already — at most 2,500 cells — and the browser scales it over the
// block's lat/lon rectangle for free. Cells outside the block are painted
// transparent, so the imagery's trees stay visible around the ground.

import L from "leaflet";
import { cellCentre, paint, type SunGrid, type SunView } from "./sunGrid";

/// The overlay sits under the vector shapes and over the basemap, as radar does.
const OPACITY = 0.7;
const Z = 350;

export interface SunState {
  view: SunView;
  month: number;
  fullLeaf: boolean;
  /// Kept-cell index of the selected spot, or −1.
  selected: number;
  /// Kept-cell index of the best place for panels, or −1.
  best: number;
}

export interface SunLayer {
  update(state: SunState): void;
  remove(): void;
}

function image(g: SunGrid, state: SunState): string {
  const canvas = document.createElement("canvas");
  canvas.width = g.cols;
  canvas.height = g.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(paint(g, state.view, state.month, state.fullLeaf), g.cols, g.rows), 0, 0);
  return canvas.toDataURL();
}

function marker(text: string, className: string): L.DivIcon {
  return L.divIcon({ html: text, className, iconSize: [22, 22], iconAnchor: [11, 11] });
}

export function mountSun(map: L.Map, g: SunGrid, initial: SunState): SunLayer {
  const bounds = L.latLngBounds([g.bounds.minLat, g.bounds.minLon], [g.bounds.maxLat, g.bounds.maxLon]);
  const overlay = L.imageOverlay(image(g, initial), bounds, { opacity: OPACITY, zIndex: Z, interactive: false });
  overlay.addTo(map);
  const pins = L.layerGroup().addTo(map);
  let last = initial;

  const draw = (state: SunState) => {
    pins.clearLayers();
    if (state.view === "solar" && state.best >= 0) {
      const c = cellCentre(g, state.best);
      L.marker([c.lat, c.lon], { icon: marker("◆", "sun-best"), interactive: false, keyboard: false }).addTo(pins);
    }
    if (state.selected >= 0) {
      const c = cellCentre(g, state.selected);
      L.circleMarker([c.lat, c.lon], {
        radius: 9, color: "#FFFFFF", weight: 2.5, fillColor: "#20301B", fillOpacity: 0.35, interactive: false,
      }).addTo(pins);
    }
  };
  draw(initial);

  return {
    update(state) {
      if (state.view !== last.view || state.month !== last.month || state.fullLeaf !== last.fullLeaf) {
        overlay.setUrl(image(g, state));
      }
      draw(state);
      last = state;
    },
    remove() {
      map.removeLayer(overlay);
      map.removeLayer(pins);
    },
  };
}
