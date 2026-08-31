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
// Touch is the primary input, not an afterthought: this runs on an iPad in a
// packing shed.
//
// iPadOS fights pinch. `touch-action: none` governs scrolling and panning but
// does NOT suppress Safari's page zoom, which lives on the visual viewport;
// and `user-scalable=no` is ignored on iOS by design, for accessibility. The
// only lever that actually works is WebKit's proprietary `gesturestart` /
// `gesturechange` pair — preventing those suppresses the page zoom, and
// `gesturechange` hands over `scale` directly, which is the number we wanted
// anyway. So on Safari that is the pinch path, with a pointer-based pinch as
// the fallback everywhere else.
//
// But the better answer is not to depend on pinch at all, because a pinch that
// escapes to the browser is worse than no gesture. Three conflict-free paths
// do the real work:
//
//   * **Drag an axis to scale it.** Dragging in the left gutter scales GDD,
//     dragging along the bottom scales dates. One finger, unambiguous, and it
//     names the axis by where you touch instead of by how you spread.
//   * **Double-tap to zoom in, two-finger tap to zoom out.** Both are standard
//     iOS idioms and neither collides with the page.
//   * **The buttons**, which always work and are 44 px.

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

/// Which gutter a pointer went down in — the axis it will scale.
type Grab = "plot" | "x-axis" | "y-axis";

/// The plot area as a fraction of the SVG box, matching the charts' L/R/T/B.
/// Anything left of the plot scales Y; anything below it scales X.
const PLOT_LEFT = 0.062;
const PLOT_BOTTOM = 0.87;

function grabZone(fx: number, fy: number): Grab {
  if (fx < PLOT_LEFT) return "y-axis";
  if (fy > PLOT_BOTTOM) return "x-axis";
  return "plot";
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

  // WebKit gesture events. Preventing `gesturestart` is the ONLY thing that
  // stops iPadOS zooming the whole page, and `gesturechange.scale` is the
  // pinch we wanted — so on Safari this replaces the pointer-pinch entirely.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let last = 1;

    const start = (e: Event) => { e.preventDefault(); last = 1; };
    const change = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale;
      if (typeof scale !== "number" || scale <= 0) return;
      const factor = last / scale;
      last = scale;
      // A WebKit pinch reports one scalar, not a direction, so it drives both
      // axes together — which is what a two-finger spread on a picture means.
      if (Math.abs(factor - 1) > 0.005) { zoomX(factor); zoomY(factor); }
    };
    const end = (e: Event) => e.preventDefault();

    el.addEventListener("gesturestart", start as EventListener, { passive: false });
    el.addEventListener("gesturechange", change as EventListener, { passive: false });
    el.addEventListener("gestureend", end as EventListener, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", start as EventListener);
      el.removeEventListener("gesturechange", change as EventListener);
      el.removeEventListener("gestureend", end as EventListener);
    };
  }, [zoomX, zoomY]);

  // Double-tap zooms in; a two-finger tap zooms out. Both are standard iOS
  // idioms, and neither can escape to the browser the way a pinch can.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let lastTap = 0;
    const tap = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const now = performance.now();
      if (now - lastTap < 320) { zoomX(1 / 1.5); zoomY(1 / 1.5); lastTap = 0; }
      else lastTap = now;
    };
    const two = (e: TouchEvent) => {
      if (e.touches.length === 2) { zoomX(1.5); zoomY(1.5); }
    };
    el.addEventListener("pointerup", tap);
    el.addEventListener("touchend", two);
    return () => { el.removeEventListener("pointerup", tap); el.removeEventListener("touchend", two); };
  }, [zoomX, zoomY]);

  // Pointer handling covers touch, pen and mouse in one path.
  //   in a gutter  → drag to scale that axis. One finger, and the axis is
  //                  named by where you touched rather than by how you spread.
  //   in the plot  → pan, once zoomed.
  //   two pointers → pinch, for browsers without WebKit gesture events.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const active = new Map<number, { x: number; y: number }>();
    let pinch: { dx: number; dy: number } | null = null;
    let grab: Grab = "plot";

    const spread = () => {
      const [a, b] = [...active.values()];
      return { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y) };
    };

    const down = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      if (active.size === 0) {
        grab = grabZone((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
      }
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

      // Axis drag: pulling away from the plot expands that axis, pushing
      // toward it compresses. Reads like stretching the ruler.
      if (grab === "y-axis") {
        const dy = (e.clientY - prev.y) / box.height;
        if (Math.abs(dy) > 0.001) zoomY(1 + dy * 2.2);
        e.preventDefault();
        return;
      }
      if (grab === "x-axis") {
        const dx = (e.clientX - prev.x) / box.width;
        if (Math.abs(dx) > 0.001) zoomX(1 - dx * 2.2);
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
      if (active.size === 0) grab = "plot";
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
