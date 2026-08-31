// Weather radar tiles.
//
// A note on the ask, because the honest answer shapes the feature: radar does
// not run ±1 day. Radar is an OBSERVATION — a returned echo off actual
// raindrops — so it cannot exist for tomorrow, and the free public archive
// keeps roughly the last two hours. Anything labelled "radar" further out is a
// forecast model wearing radar's clothes.
//
// So this ships what radar actually is: the last ~2 hours, animated, plus
// whatever short nowcast frames are published. For the day ahead, the Almanac
// already carries an hourly precipitation forecast, which is the honest
// instrument for that question.
//
// RainViewer, public tiles, no key.

const INDEX = "https://api.rainviewer.com/public/weather-maps.json";

export interface RadarFrame {
  time: number;      // unix seconds
  path: string;
  kind: "past" | "nowcast";
}

export interface RadarIndex {
  host: string;
  frames: RadarFrame[];
  generated: number;
}

export async function fetchRadarIndex(signal?: AbortSignal): Promise<RadarIndex> {
  const r = await fetch(INDEX, { signal });
  if (!r.ok) throw new Error(`Radar index unavailable (${r.status})`);
  const d = (await r.json()) as {
    host: string;
    generated: number;
    radar?: { past?: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] };
  };
  const past = (d.radar?.past ?? []).map((f) => ({ ...f, kind: "past" as const }));
  const now = (d.radar?.nowcast ?? []).map((f) => ({ ...f, kind: "nowcast" as const }));
  const frames = [...past, ...now].sort((a, b) => a.time - b.time);
  if (!frames.length) throw new Error("No radar frames are published right now.");
  return { host: d.host, frames, generated: d.generated };
}

/// Tile URL for one frame.
///   colour 2  — the universal blue/green/red scheme growers recognise
///   smooth 1  — interpolated rather than blocky
///   snow 1    — snow shown distinctly from rain, which matters in Vermont
export function tileUrl(idx: RadarIndex, frame: RadarFrame): string {
  return `${idx.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

export function frameLabel(f: RadarFrame): string {
  const d = new Date(f.time * 1000);
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return f.kind === "nowcast" ? `${t} forecast` : t;
}

/// How far back the published frames actually reach, in hours — stated rather
/// than assumed, so the control can say what it really covers.
export function coverageHours(idx: RadarIndex): number {
  const f = idx.frames;
  return f.length > 1 ? (f[f.length - 1].time - f[0].time) / 3600 : 0;
}
