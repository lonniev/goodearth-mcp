// How tall a chart's drawing is: its inline height on the page, and in full
// screen the height the frame actually has to give.
//
// These plots carry a fixed viewBox aspect, so a full-screen frame that only
// widened them made them wider and proportionally taller, and the rest of the
// screen went to margin. Full screen buys both axes: the drawing takes the
// height left over and its aspect changes to fit.

import { type RefObject, useLayoutEffect, useState } from "react";
import { useChartFrame } from "../components/ui";

/// How tall the drawing can be and still leave its own controls on screen.
///
/// MEASURED, not chosen. A fixed full-screen height was 885 px tall on a
/// 834 px iPad — the plot alone was bigger than the window, so the controls
/// under it were pushed off the bottom and the frame had to scroll. A number
/// that fits one screen is wrong on every other one.
///
/// Everything in the card that is NOT the plot — zoom buttons, legend, the
/// card's own padding — is already laid out and none of it depends on the
/// plot's height. So the space left is a straight subtraction from the height
/// the FRAME measured, and it settles in one pass. Deriving it from the card's
/// own position instead left 80 px of slack: the card was centred, so its top
/// moved with its height, which moved with the plot.
///
/// `inline` is also the floor (full screen never makes a plot SHORTER) and
/// `max` the ceiling (a very tall window must not stretch the curve into a
/// wall). `width` is the drawing's viewBox width; the result is in its units.
///
/// The plot is found in `card` by `data-plot`, not handed in as a ref: the
/// chart's own svg ref comes from its zoom hook, which needs this height first.
export function useFrameHeight({ inline, max, width, card }: {
  inline: number;
  max: number;
  width: number;
  card: RefObject<HTMLElement | null>;
}): number {
  const { full, slotH } = useChartFrame();
  const [fullH, setFullH] = useState(inline);

  useLayoutEffect(() => {
    if (!full || slotH <= 0) { setFullH(inline); return; }
    const box = card.current, plot = box?.querySelector("svg[data-plot]")?.getBoundingClientRect();
    if (!box || !plot) return;
    const avail = slotH - (box.scrollHeight - plot.height) - 6;
    if (plot.width > 0 && avail > 140) {
      setFullH(Math.max(inline, Math.min(max, Math.round((width * avail) / plot.width))));
    }
  }, [full, slotH, inline, max, width, card]);

  return full ? fullH : inline;
}
