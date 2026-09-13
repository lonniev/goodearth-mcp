// The gestures, said where they happen and only when asked.
//
// They used to be a line of grey type under the chart, permanently. It is
// discovery text: a reader needs it once and then reads past it forever, and
// it was costing a row of height on the one card whose whole purpose is the
// picture above it.
//
// So: press and hold on the chart. A `title` alone would have been simpler and
// would have done nothing on the device this app is actually used on — iPadOS
// Safari does not surface `title` on a long press. It is set as well, because
// a mouse hover is free.
//
// Held for 450 ms WITHOUT moving, because the chart's own gestures start with
// movement: a drag in a gutter scales an axis and a drag in the middle pans.
// Any movement past a few pixels cancels this, so the hint can never appear
// in the middle of a pan.
//
// AND IT MUST ALWAYS GO AWAY. It shipped closing only on a click on itself.
// On the iPad that click did not arrive — the same lost tap as the plant
// picker — and a tap anywhere else on the chart only started another hold, so
// once raised nothing cleared it. Now: lifting a finger on it, any touch on the
// chart, Escape, or simply waiting all put it away.

import { useCallback, useEffect, useRef, useState } from "react";

export const HOLD_MS = 450;
/// How far a finger may wander and still count as held rather than dragged.
export const SLOP_PX = 8;
/// It leaves by itself after this long. Discovery text that has to be
/// dismissed is text that can get stuck.
export const SHOW_MS = 8000;

export function gestureText(isZoomed: boolean): string {
  return "drag the left edge to stretch the scale · drag along the bottom for dates"
    + " · double-tap in, two-finger tap out"
    + (isZoomed ? " · drag the middle to pan" : "");
}

export default function GestureHint({ isZoomed, children }: {
  isZoomed: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
    from.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  // While it is up: leave by itself, and on Escape.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), SHOW_MS);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => { window.clearTimeout(t); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div
      className="relative"
      title={gestureText(isZoomed)}
      onPointerDown={(e) => {
        // Any touch on the chart while the hint is up puts it away, and starts
        // no new hold: the grower's next move is the gesture they just read.
        if (open) { setOpen(false); cancel(); return; }
        from.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => setOpen(true), HOLD_MS);
      }}
      onPointerMove={(e) => {
        const f = from.current;
        if (!f) return;
        if (Math.abs(e.clientX - f.x) > SLOP_PX || Math.abs(e.clientY - f.y) > SLOP_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
    >
      {children}
      {open && (
        // Closed when the finger LIFTS on it, not on a click the iPad may never
        // send; the click stays for a keyboard. Its own press stops here, so it
        // cannot start the hold that raised it.
        <button type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => { e.stopPropagation(); setOpen(false); }}
          onClick={() => setOpen(false)}
          className="absolute inset-x-2 bottom-2 z-10 rounded-md border border-rule bg-paper/95 px-3 py-2 text-left shadow-lg">
          <span className="data text-[11px] leading-relaxed text-ink">
            {gestureText(isZoomed)}
          </span>
          <span className="data mt-0.5 block text-[10px] text-ink-soft">tap to dismiss</span>
        </button>
      )}
    </div>
  );
}
