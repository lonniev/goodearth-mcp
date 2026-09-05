// Which way a bee is drawn, given which way it is going.
//
// Separated from the animation because the last version of this was wrong
// in a way nobody could see without watching the screen, and a transform
// buried in a requestAnimationFrame loop is not something a test can reach.

/// Which way the 🐝 glyph faces before anything is done to it, in the same
/// degrees the flight vector is measured in: 0 is east, 180 is west.
///
/// **It points west.** Every platform draws the bee in left profile, head at
/// the leading edge. The rendering below was written as though it pointed
/// east, which mirrored it on exactly the wrong branch — so a bee crossing the
/// screen to the right showed its tail first, and only a bee heading left
/// happened to look right.
const GLYPH_HEADING = 180;

/// How to draw a bee moving along `tilt` degrees so it points where it is
/// going.
///
/// Two ways to aim a glyph: rotate it, or mirror it and rotate less. Rotation
/// alone would put a westbound bee on its back, since anything past a quarter
/// turn reads as upside down — an insect can bank, it does not fly inverted.
/// So a bee heading east is mirrored and rotated by its tilt, and one heading
/// west is left alone and rotated by tilt minus the glyph's own heading. Both
/// end up nose-first with their backs to the sky.
///
/// Pure, and separated from the animation, because the last version of this
/// was wrong in a way nobody could see without watching the screen.
export function aimBee(tilt: number): { rotate: number; mirror: boolean } {
  const eastbound = Math.abs(tilt) <= 90;
  return eastbound
    ? { rotate: turn(tilt), mirror: true }
    : { rotate: turn(tilt - GLYPH_HEADING), mirror: false };
}

/// An angle as the shortest way round, in (-180, 180].
///
/// A bee heading down and to the left came out of the arithmetic at -315°,
/// which draws identically to +45° and is not the same number. The rendering
/// was right and the value was a lie, which is the kind of thing that reads as
/// fine until something else tries to reason about it.
function turn(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}
