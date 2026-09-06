// Keeping the current view visible in a rail that scrolls sideways.
//
// On a phone the rail is a bottom bar: thirteen items, 838 px of them, in a
// 390 px window. It scrolls, so nothing is unreachable — but it always opened
// at the left, so a grower on Tasks, Field Reports, References or About was
// looking at a bar that did not contain the page they were on. Measured before
// this existed: `navScrollLeft=0` on every view, and the active item off-screen
// for everything past Pests.
//
// Its own module because the arithmetic is the part that is wrong quietly: an
// off-by-one here does not throw, it just puts the tab half under the edge.

/// Where the strip should be scrolled to so `item` sits in the middle of it.
///
/// Centred rather than merely "just inside", so the items on either side show
/// too — which is what tells a reader the bar scrolls at all. Clamped to the
/// real range, because scrolling past either end leaves a gap where the first
/// or last item should be.
export function centreOn(
  itemLeft: number, itemWidth: number, viewport: number, scrollWidth: number,
): number {
  const ideal = itemLeft - (viewport - itemWidth) / 2;
  const most = Math.max(0, scrollWidth - viewport);
  return Math.round(Math.min(Math.max(ideal, 0), most));
}

/// Is the strip actually scrollable? A column rail on a wide screen is not,
/// and moving its scrollLeft would be meaningless rather than harmless.
export function scrolls(viewport: number, scrollWidth: number): boolean {
  return scrollWidth > viewport + 1;
}
