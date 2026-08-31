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

  // Drag to pan, once zoomed. At full extent there is nothing to pan to, so
  // drags do nothing.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !isZoomed) return;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const box = el.getBoundingClientRect();
      panX(-(e.clientX - last.x) / box.width);
      panY((e.clientY - last.y) / box.height);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      last = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [isZoomed, panX, panY]);

  return { zoom, setZoom, zoomX, zoomY, panX, panY, reset, isZoomed, svgRef };
}

/// Map a zoom window onto a domain, giving the visible [min,max].
export function windowToDomain(w: Window1D, min: number, max: number): [number, number] {
  const span = max - min;
  return [min + span * w.lo, min + span * w.hi];
}
