// A still of the ground, for a chart's background.
//
// The season curve is an abstraction of a real field. Ghosting that field in
// behind it costs nothing and answers a question the axes cannot: *whose*
// season is this. On a farm with six saved blocks that is not decoration, it is
// orientation.
//
// Esri's World Imagery export endpoint, no key, same imagery the map draws.

const EXPORT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";

export interface Bbox {
  min_lat: number; min_lon: number; max_lat: number; max_lon: number;
}

/// A JPEG of the region, padded so the block sits inside its surroundings
/// rather than filling the frame — context is the point.
export function regionImageUrl(bbox: Bbox, w = 800, h = 300, pad = 0.35): string {
  const dLat = (bbox.max_lat - bbox.min_lat) || 0.01;
  const dLon = (bbox.max_lon - bbox.min_lon) || 0.01;

  // Match the image's aspect to the chart's, or the export stretches.
  const want = w / h;
  let padLat = dLat * pad, padLon = dLon * pad;
  const have = (dLon + 2 * padLon) / (dLat + 2 * padLat);
  if (have < want) padLon += ((want / have - 1) * (dLon + 2 * padLon)) / 2;
  else padLat += ((have / want - 1) * (dLat + 2 * padLat)) / 2;

  const box = [
    bbox.min_lon - padLon, bbox.min_lat - padLat,
    bbox.max_lon + padLon, bbox.max_lat + padLat,
  ].map((v) => v.toFixed(5)).join(",");

  const q = new URLSearchParams({
    bbox: box, bboxSR: "4326", size: `${w},${h}`, format: "jpg", f: "image",
  });
  return `${EXPORT}?${q}`;
}
