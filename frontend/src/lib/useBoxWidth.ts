// The width a chart's box actually has, in CSS pixels.
//
// A chart drawn in a fixed 740-unit box and stretched to fit is a picture of a
// chart: on a 390 px phone its 9-point labels would land at 4 px, and holding
// it at a legible minimum width instead is what pushed the Almanac's charts out
// past the right edge of their cards. Measuring the box lets a chart draw at
// its real width — one unit to one pixel — at any size.
//
// A callback ref rather than a ref object, because the box is often not there
// on the first render — a chart shows "not enough on record yet" until its
// data arrives — and an effect keyed on a ref object would never see it come.

import { useLayoutEffect, useState } from "react";

export function useBoxWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, width };
}
