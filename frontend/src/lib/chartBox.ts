// How wide to draw a chart that draws at its box's own width.
//
// The Almanac's charts were a fixed 740-unit drawing held at a 520 px minimum,
// so on a 390 px phone each ran 229 px past the right edge of its card — and
// the part cut off was the most recent weeks and the forecast. Drawn at the
// box's measured width instead, a unit is a pixel: the labels stay 9 px and
// nothing is wider than the card it sits in.

/// Before the box has been measured — the first render, or a test.
export const DEFAULT_W = 740;
/// Below this the plot is too narrow to read; the drawing is scaled into a
/// narrower box rather than drawn narrower still. Scaled, never overflowing.
export const MIN_W = 280;

export function drawWidth(measured: number): number {
  return measured > 0 ? Math.max(Math.round(measured), MIN_W) : DEFAULT_W;
}
