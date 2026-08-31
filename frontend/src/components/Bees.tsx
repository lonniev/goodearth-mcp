// Bees, loose on the page — and an instrument, not an ornament.
//
// ── What they are telling you ─────────────────────────────────────────────
//
// Honeybee flight is temperature-gated: below roughly 55 °F they do not
// forage. So the corner of the screen answers, without a word of chrome, the
// question that gates a lot of a grower's own field work — is it warm enough
// to be out there.
//
//   frost watch live   no bees. The hive is shut.
//   below 55 °F        one bee at the door, barely moving.
//   above 55 °F        several, and the warmer it is the more agitated they are.
//
// TWO channels carry it, which is what makes it readable at a glance rather
// than a thing you decode: HOW MANY, and HOW BUSY. A hive at 58 °F and one at
// 85 °F both have bees flying; only the second is humming.
//
// ── Why the motion is what it is ──────────────────────────────────────────
//
// The first version steered each bee toward a target and picked another on
// arrival, which drew straight lines between waypoints — a bee's path is
// nothing like that. This one has no waypoints at all. Each bee carries three
// layered sine terms at incommensurate frequencies, which never repeat and
// never resolve into a line, plus a fast small-amplitude vibration whose
// energy IS the temperature signal.
//
// They can never intercept a touch: the layer and every bee carry
// pointer-events:none, so a finger passes straight through. A bee that
// swallowed a tap on a frost warning would be unforgivable decoration.

import { useEffect, useRef } from "react";
import type { HiveMood } from "./Hive";

interface Bee {
  /// Home position in viewport fractions — the centre this bee meanders about.
  hx: number; hy: number;
  /// Three wander terms: amplitude, frequency, phase, per axis.
  wx: [number, number, number][];
  wy: [number, number, number][];
  vibePhase: number;
  scale: number;
  /// Slow drift of the home point, so a bee works a patch and then moves on.
  dx: number; dy: number;
}

/// 0 at the flight threshold, 1 in real working heat. This is the second
/// channel — it drives vibration, not position.
function activityOf(tempF: number | null): number {
  if (tempF == null) return 0.35;
  return Math.max(0, Math.min(1, (tempF - 55) / 30));
}

function beeCount(mood: HiveMood, activity: number): number {
  if (mood === "closed") return 0;
  if (mood === "quiet") return 1;
  if (mood === "unknown") return 2;
  return 2 + Math.round(activity * 4);   // 2 at the threshold, 6 in full heat
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function spawn(n: number): Bee[] {
  return Array.from({ length: n }, () => ({
    // Scattered from the start. Spawning them all at the hive made a cluster
    // that took ten seconds to disperse, which is all anybody watched.
    hx: rnd(0.08, 0.92),
    hy: rnd(0.1, 0.88),
    wx: [
      [rnd(0.03, 0.09), rnd(0.09, 0.16), rnd(0, 6.28)],
      [rnd(0.02, 0.05), rnd(0.23, 0.37), rnd(0, 6.28)],
      [rnd(0.01, 0.02), rnd(0.7, 1.1), rnd(0, 6.28)],
    ],
    wy: [
      [rnd(0.03, 0.08), rnd(0.11, 0.19), rnd(0, 6.28)],
      [rnd(0.015, 0.04), rnd(0.29, 0.43), rnd(0, 6.28)],
      [rnd(0.008, 0.018), rnd(0.8, 1.3), rnd(0, 6.28)],
    ],
    vibePhase: rnd(0, 6.28),
    scale: rnd(0.8, 1.35),
    dx: rnd(-0.012, 0.012),
    dy: rnd(-0.008, 0.008),
  }));
}

export default function Bees({
  mood = "unknown", tempF = null,
}: { mood?: HiveMood; tempF?: number | null }) {
  const layer = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const host = layer.current;
    if (!host) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const activity = activityOf(tempF);
    const n = beeCount(mood, activity);
    host.replaceChildren();
    if (!n) return;

    const bees = spawn(n);
    const nodes: HTMLDivElement[] = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;left:0;top:0;pointer-events:none;will-change:transform;" +
        `font-size:${11 + bees[i].scale * 4}px;line-height:1;user-select:none;opacity:.5;`;
      el.textContent = "🐝";
      el.setAttribute("aria-hidden", "true");
      host.appendChild(el);
      nodes.push(el);
    }

    if (reduced) {
      bees.forEach((b, i) => {
        nodes[i].style.transform = `translate(${b.hx * 100}vw, ${b.hy * 100}vh)`;
      });
      return;
    }

    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / 1000;

      bees.forEach((b, i) => {
        // Home drifts slowly and wraps, so a bee works a patch then moves on
        // rather than orbiting one spot for ever.
        let hx = b.hx + b.dx * t;
        let hy = b.hy + b.dy * t;
        hx = ((hx % 1) + 1) % 1;
        hy = 0.08 + (((hy - 0.08) % 0.82) + 0.82) % 0.82;

        // Three incommensurate sines per axis: never repeats, never a line.
        let x = hx, y = hy;
        for (const [amp, freq, ph] of b.wx) x += amp * Math.sin(t * freq + ph);
        for (const [amp, freq, ph] of b.wy) y += amp * Math.cos(t * freq + ph);

        // The vibration IS the temperature reading. A hive at 58 °F and one at
        // 85 °F both have bees up; only the second is humming.
        const buzz = 0.0012 + activity * 0.0045;
        const rate = 14 + activity * 26;
        x += buzz * Math.sin(t * rate + b.vibePhase);
        y += buzz * Math.cos(t * rate * 1.31 + b.vibePhase);

        x = Math.min(Math.max(x, 0.02), 0.97);
        y = Math.min(Math.max(y, 0.05), 0.95);

        // Face the way it is going, so a bee never flies backwards.
        const tilt = Math.sin(t * b.wx[0][1] + b.wx[0][2]) * 18;
        nodes[i].style.transform =
          `translate(${x * 100}vw, ${y * 100}vh) rotate(${tilt}deg) scale(${b.scale})`;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [mood, tempF]);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[500] overflow-hidden"
    />
  );
}
