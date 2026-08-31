// Bees, loose on the page.
//
// The skep stays anchored bottom-right as home; the foragers work the whole
// screen. That is what they do — a hive's forage radius is measured in miles,
// not in the corner of a chart — and a farm app that shows bees confined to a
// decorative vignette has drawn a diagram rather than a farm.
//
// Two hard rules:
//
//   1. **They can never intercept a touch.** The layer and every bee carry
//      `pointer-events: none`, so a finger passes straight through to whatever
//      is underneath. A bee that swallows a tap on a frost warning would be an
//      unforgivable piece of decoration.
//   2. **They stay an instrument.** Bee count still reads the block's own
//      temperature against the 55°F flight threshold, and a live frost watch
//      grounds them entirely. If they are flying, it is warm enough to work.
//
// Motion is one requestAnimationFrame loop for the whole flight, not a timer
// per bee, and it parks completely under prefers-reduced-motion.

import { useEffect, useRef } from "react";
import type { HiveMood } from "./Hive";

interface Bee {
  x: number; y: number;      // fraction of viewport, 0..1
  vx: number; vy: number;
  /// Where this bee is heading. Reaching it picks another.
  tx: number; ty: number;
  phase: number;             // wing-beat offset, so they do not pulse in step
  scale: number;
}

const HOME = { x: 0.94, y: 0.9 };   // the skep, bottom-right

function spawn(n: number): Bee[] {
  return Array.from({ length: n }, (_, i) => ({
    x: HOME.x, y: HOME.y,
    vx: 0, vy: 0,
    tx: Math.random(), ty: Math.random() * 0.85,
    phase: (i * 2.4) % 6.28,
    scale: 0.85 + Math.random() * 0.4,
  }));
}

/// How many foragers are out. The same instrument as before, just at large.
function beeCount(mood: HiveMood): number {
  if (mood === "closed") return 0;
  if (mood === "flying") return 4;
  if (mood === "quiet") return 1;
  return 2;
}

export default function Bees({ mood = "unknown" }: { mood?: HiveMood }) {
  const layer = useRef<HTMLDivElement | null>(null);
  const bees = useRef<Bee[]>([]);
  const nodes = useRef<HTMLDivElement[]>([]);
  const raf = useRef<number>(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const host = layer.current;
    if (!host) return;

    const n = beeCount(mood);
    host.replaceChildren();
    nodes.current = [];
    bees.current = spawn(n);

    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      // Belt and braces: the layer is already pointer-events:none, and so is
      // every bee. Nothing here can ever be the target of a touch.
      el.style.cssText =
        "position:absolute;left:0;top:0;pointer-events:none;will-change:transform;" +
        "font-size:13px;line-height:1;user-select:none;";
      el.textContent = "🐝";
      el.setAttribute("aria-hidden", "true");
      host.appendChild(el);
      nodes.current.push(el);
    }

    if (!n) return;

    if (reduced) {
      // Parked on the skep, still telling the same story by their number.
      nodes.current.forEach((el, i) => {
        el.style.transform =
          `translate(${(HOME.x - 0.01 * i) * 100}vw, ${(HOME.y - 0.01 * i) * 100}vh)`;
        el.style.opacity = "0.5";
      });
      return;
    }

    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      bees.current.forEach((b, i) => {
        // Steer toward the target; pick a new one on arrival. Bees do not fly
        // in straight lines, so the steering is loose and the drag is high.
        const dx = b.tx - b.x, dy = b.ty - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.03) {
          b.tx = Math.random();
          b.ty = Math.random() * 0.85;
        } else {
          b.vx += (dx / d) * 0.06 * dt;
          b.vy += (dy / d) * 0.06 * dt;
        }
        // A wobble, because a bee's path is not a spline.
        b.vx += Math.sin(now / 220 + b.phase) * 0.004 * dt;
        b.vy += Math.cos(now / 190 + b.phase) * 0.004 * dt;

        b.vx *= 0.97; b.vy *= 0.97;
        b.x += b.vx; b.y += b.vy;

        // Keep them on screen without a hard bounce, which reads as a bug.
        if (b.x < 0.02 || b.x > 0.98) { b.vx *= -0.6; b.x = Math.min(Math.max(b.x, 0.02), 0.98); }
        if (b.y < 0.04 || b.y > 0.96) { b.vy *= -0.6; b.y = Math.min(Math.max(b.y, 0.04), 0.96); }

        const el = nodes.current[i];
        if (el) {
          const tilt = Math.max(-25, Math.min(25, b.vx * 900));
          el.style.transform =
            `translate(${b.x * 100}vw, ${b.y * 100}vh) rotate(${tilt}deg) scale(${b.scale})`;
          el.style.opacity = "0.55";
        }
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [mood]);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[500] overflow-hidden"
    />
  );
}
