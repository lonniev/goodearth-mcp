// Where a flag's label goes.
//
// The anchor is not negotiable: a flag marks a day, so its dot and its stem
// stay on that day's x. Everything else is free, and the old rule used almost
// none of that freedom — `stem = 16 + (i % 3) * 13` rotated through three
// heights by ARRAY INDEX, so it never knew whether two labels were near each
// other and never used more than 42px above the curve. Where a season bunches
// its events, the labels landed on top of one another and on the curve, while
// the whole upper half of the plot sat empty.
//
// This resolves actual collisions instead. Each label is pushed up until its
// box clears every box already placed, which spreads a crowded stretch
// vertically into the empty space and leaves an isolated flag sitting close
// to its own point.

export interface LabelItem {
  /// The flag's x. Fixed — this is the day being marked.
  cx: number;
  /// The anchor's y, on the curve.
  cy: number;
  /// Wrapped label lines, longest of which decides the width.
  lines: string[];
}

export interface Placement {
  /// Distance from the anchor up to the label's baseline.
  stem: number;
  /// Draw the label to the left of the stem rather than the right.
  flip: boolean;
}

export interface PlaceOpts {
  left: number;
  right: number;
  /// The top of the plot. Labels are not pushed above it.
  top: number;
  /// Width of one character at the label's font size.
  charW: number;
  /// Distance between wrapped lines.
  lineH: number;
}

const MIN_STEM = 14;
/// How far a label may climb before it is left where it is. Without a ceiling
/// a dense week would launch one label to the top of the plot and strand its
/// stem across every gridline on the way.
const MAX_STEM = 190;

interface Box { x0: number; x1: number; y0: number; y1: number }

function overlaps(a: Box, b: Box): boolean {
  // A 3px gutter, so two labels that merely touch still read as two.
  return a.x0 < b.x1 + 3 && b.x0 < a.x1 + 3 && a.y0 < b.y1 + 3 && b.y0 < a.y1 + 3;
}

export function placeLabels(items: LabelItem[], o: PlaceOpts): Placement[] {
  const placed: Box[] = [];
  const out: Placement[] = [];

  // Left to right, so a label yields to the one before it rather than to
  // whichever happened to be earlier in the array.
  const order = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.cx - b.it.cx);

  for (const { it, i } of order) {
    const chars = it.lines.reduce((m, l) => Math.max(m, l.length), 0);
    const w = chars * o.charW + 10;
    const h = it.lines.length * o.lineH;
    const flip = it.cx + w > o.right;
    const x0 = flip ? it.cx - w : it.cx;

    let stem = MIN_STEM;
    for (;;) {
      const y1 = it.cy - stem;
      const box: Box = { x0, x1: x0 + w, y0: y1 - h, y1 };
      const hits = placed.some((p) => overlaps(box, p));
      if (!hits) break;
      // Climbing past the plot top helps nobody: stop and accept the overlap
      // rather than drawing a label off the chart.
      if (stem + o.lineH > MAX_STEM || box.y0 - o.lineH < o.top) break;
      stem += o.lineH + 2;
    }

    const y1 = it.cy - stem;
    placed.push({ x0, x1: x0 + w, y0: y1 - h, y1 });
    out[i] = { stem, flip };
  }

  return out;
}
