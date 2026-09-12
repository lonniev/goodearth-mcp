// Was that a tap, or the start of a scroll?
//
// The plant picker chooses a row when the finger LIFTS, not when the browser
// later synthesises a click. On the iPad the click never arrived: a grower
// tapped "sugar maple", the caret went back into the search box and nothing was
// chosen. Several things can eat a synthesised click on iOS — a surrounding
// label handing it to its input, a first tap read as hover, the keyboard
// closing and moving the row out from under the finger — and acting on the
// pointer's own up event does not depend on any of them.
//
// A finger that travels is scrolling the list, and must not pick whatever row
// it happens to lift over.

/// How far a finger may drift and still have tapped, in CSS pixels.
export const TAP_SLOP_PX = 10;

export interface PointerMark { id: string; x: number; y: number }

/// True when the press went down and came up on the same row without moving.
export function isTap(down: PointerMark | null, up: PointerMark, slop = TAP_SLOP_PX): boolean {
  if (!down || down.id !== up.id) return false;
  return Math.hypot(up.x - down.x, up.y - down.y) <= slop;
}
