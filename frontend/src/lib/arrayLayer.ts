// The array on the Sun map: a rectangle centred on the tapped spot, with one
// handle at its south-east corner that resizes it about the centre.
//
// Its own layer rather than part of `sunOverlay`, which tears its pins down
// on every update: a drag handle that is destroyed and rebuilt each time the
// state it changes comes back is a handle that drops the finger holding it.
// Here nothing is recreated — `update` moves what is already on the map.

import L from "leaflet";
import { footprintBounds, sizeFromCorner, type ArraySize } from "./arrayEconomics.ts";

const INK = "#20301B";
const HONEY = "#D99A06";

export interface ArrayLayer {
  /// Centre null hides the array.
  update(centre: { lat: number; lon: number } | null, size: ArraySize): void;
  remove(): void;
}

export function mountArray(map: L.Map, handleIcon: L.DivIcon, onResize: (s: ArraySize) => void): ArrayLayer {
  const rect = L.rectangle([[0, 0], [0, 0]], {
    color: INK, weight: 2, fillColor: HONEY, fillOpacity: 0.25, interactive: false,
  });
  const handle = L.marker([0, 0], { icon: handleIcon, draggable: true, keyboard: false, autoPanOnFocus: false });
  let centre: { lat: number; lon: number } | null = null;
  let shown = false;
  let dragging = false;

  const corner = (c: { lat: number; lon: number }, size: ArraySize): L.LatLngExpression => {
    const b = footprintBounds(c, size);
    return [b.south, b.east];
  };

  handle.on("dragstart", () => { dragging = true; });
  handle.on("drag", () => {
    if (!centre) return;
    const ll = handle.getLatLng();
    onResize(sizeFromCorner(centre, { lat: ll.lat, lon: ll.lng }));
  });
  handle.on("dragend", () => {
    dragging = false;
    if (!centre) return;
    const ll = handle.getLatLng();
    const size = sizeFromCorner(centre, { lat: ll.lat, lon: ll.lng });
    // Snap to the clamped size, so a handle dragged past the limit comes back to it.
    handle.setLatLng(corner(centre, size));
    onResize(size);
  });

  return {
    update(c, size) {
      centre = c;
      if (!c) {
        if (shown) { rect.remove(); handle.remove(); shown = false; }
        return;
      }
      const b = footprintBounds(c, size);
      rect.setBounds([[b.south, b.west], [b.north, b.east]]);
      // Mid-drag the handle is where the finger is; moving it under the
      // finger would fight the drag it is in.
      if (!dragging) handle.setLatLng(corner(c, size));
      if (!shown) { rect.addTo(map); handle.addTo(map); shown = true; }
    },
    remove() {
      rect.remove();
      handle.remove();
      shown = false;
    },
  };
}
