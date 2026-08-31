// Chart zoom + pan, on both axes independently.
//
// Every Good Earth chart needs this, not just the season curve: a grower
// comparing a 3-day frost window against a 240-day season is asking two
// different questions of the same picture. X zoom narrows the date range; Y
// zoom expands a flat stretch until its variation is legible — which matters
// here more than usual, because the spread ribbon is often a few percent of
// the axis and invisible at full scale.
//
// Deliberately not a charting library: the axes are domain quantities (days
// and GDD), so zoom state lives as domain windows and the SVG stays plain.
//
// Touch is the primary input, not an afterthought: this runs on a tablet in a
// packing shed. Pinch zooms — spreading mostly sideways zooms the dates,
// mostly upward zooms the GDD scale, so one gesture covers both axes without a
// mode switch. One finger pans once zoomed. The buttons remain for anyone on a
// mouse and for anyone who would rather not gesture at all.

import { useCallback, useEffect, useRef, useState } from "react";

export interface Window1D {
  /// Fractional bounds within the full domain, 0..1.
  lo: number;
  hi: number;
}

export interface ZoomState {
  x: Window1D;
  y: Window1D;
}

export const FULL: ZoomState = { x: { lo: 0, hi: 1 }, y: { lo: 0, hi: 1 } };

const MIN_SPAN = 0.02; // never zoom past ~2% of the domain

function clampWindow(w: Window1D): Window1D {
  let { lo, hi } = w;
  if (hi - lo < MIN_SPAN) {
    const mid = (lo + hi) / 2;
    lo = mid - MIN_SPAN / 2;
    hi = mid + MIN_SPAN / 2;
  }
  if (lo < 0) { hi += -lo; lo = 0; }
  if (hi > 1) { lo -= hi - 1; hi = 1; }
  return { lo: Math.max(lo, 0), hi: Math.min(hi, 1) };
}

/// Zoom one axis about an anchor point (0..1 within the *current* window),
/// so wheel-zoom keeps the value under the cursor put.
function zoomAbout(w: Window1D, factor: number, anchor = 0.5): Window1D {
  const span = w.hi - w.lo;
  const focus = w.lo + span * anchor;
  const next = span * factor;
  return clampWindow({ lo: focus - next * anchor, hi: focus + next * (1 - anchor) });
}

function panBy(w: Window1D, delta: number): Window1D {
  const span = w.hi - w.lo;
  return clampWindow({ lo: w.lo + delta * span, hi: w.hi + delta * span });
}

export function useChartZoom() {
  const [zoom, setZoom] = useState<ZoomState>(FULL);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const zoomX = useCallback((factor: number, anchor = 0.5) =>
    setZoom((z) => ({ ...z, x: zoomAbout(z.x, factor, anchor) })), []);
  const zoomY = useCallback((factor: number, anchor = 0.5) =>
    setZoom((z) => ({ ...z, y: zoomAbout(z.y, factor, anchor) })), []);
  const panX = useCallback((d: number) => setZoom((z) => ({ ...z, x: panBy(z.x, d) })), []);
  const panY = useCallback((d: number) => setZoom((z) => ({ ...z, y: panBy(z.y, d) })), []);
  const reset = useCallback(() => setZoom(FULL), []);

  const isZoomed = zoom.x.lo > 0 || zoom.x.hi < 1 || zoom.y.lo > 0 || zoom.y.hi < 1;

  // Wheel zooms the axis the modifier selects: plain wheel is X (the common
  // case — narrowing the date range), Shift is Y. Ctrl/Cmd is left alone so
  // browser page zoom still works.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      if (e.shiftKey) {
        // SVG y grows downward; invert so the anchor tracks the value shown.
        zoomY(factor, 1 - (e.clientY - box.top) / box.height);
      } else {
        zoomX(factor, (e.clientX - box.left) / box.width);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomX, zoomY]);

  // Pointer handling covers touch, pen and mouse in one path.
  //   one pointer  → pan (only once zoomed; at full extent there is nowhere
  //                  to pan, so a stray swipe does nothing)
  //   two pointers → pinch. The gesture's own direction picks the axis:
  //                  a mostly-horizontal spread zooms dates, a mostly-vertical
  //                  one zooms GDD, and a diagonal does both in proportion.
  //                  That beats a mode toggle, which costs a tap before every
  //                  adjustment.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const active = new Map<number, { x: number; y: number }>();
    let pinch: { dx: number; dy: number } | null = null;

    const spread = () => {
      const [a, b] = [...active.values()];
      return { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y) };
    };

    const down = (e: PointerEvent) => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (active.size === 2) pinch = spread();
    };

    const move = (e: PointerEvent) => {
      const prev = active.get(e.pointerId);
      if (!prev) return;
      const box = el.getBoundingClientRect();
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (active.size >= 2) {
        if (!pinch) { pinch = spread(); return; }
        const now = spread();
        // Only the axis that actually moved gets zoomed, so a horizontal
        // pinch does not quietly rescale the vertical too.
        if (now.dx > 12 && pinch.dx > 12 && Math.abs(now.dx - pinch.dx) > 2) {
          zoomX(pinch.dx / now.dx);
        }
        if (now.dy > 12 && pinch.dy > 12 && Math.abs(now.dy - pinch.dy) > 2) {
          zoomY(pinch.dy / now.dy);
        }
        pinch = now;
        e.preventDefault();
        return;
      }

      if (!isZoomed) return;
      panX(-(e.clientX - prev.x) / box.width);
      panY((e.clientY - prev.y) / box.height);
      e.preventDefault();
    };

    const up = (e: PointerEvent) => {
      active.delete(e.pointerId);
      if (active.size < 2) pinch = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [isZoomed, panX, panY, zoomX, zoomY]);

  return { zoom, setZoom, zoomX, zoomY, panX, panY, reset, isZoomed, svgRef };
}

/// Map a zoom window onto a domain, giving the visible [min,max].
export function windowToDomain(w: Window1D, min: number, max: number): [number, number] {
  const span = max - min;
  return [min + span * w.lo, min + span * w.hi];
}
