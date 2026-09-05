// Bees — a foraging trip, not a screensaver.
//
// ── What they are telling you ─────────────────────────────────────────────
//
// Honeybee flight is temperature-gated: below roughly 55 °F they do not
// forage. So the screen answers, without a word of chrome, the question that
// gates a lot of a grower's own field work — is it warm enough to be out
// there.
//
//   frost watch live   no bees. The hive is shut.
//   below 55 °F        one bee at the door, barely moving.
//   above 55 °F        several, and the warmer it is the harder they work.
//
// Two channels, which is what makes it readable at a glance rather than
// decoded: HOW MANY, and HOW BUSY. A hive at 58 °F and one at 85 °F both have
// bees up; only the second is humming.
//
// ── Why the motion is a state machine ─────────────────────────────────────
//
// The previous version summed sine waves. It never repeated, which fixed the
// straight lines, but it was still wrong: it drifted. A real forager leaves
// the hive, flies out to a patch, WORKS it in short darts and hovers, and
// comes home. So each bee runs that trip —
//
//   leaving → foraging → returning → at the door → out again
//
// — on steering forces with real acceleration and drag, which is what produces
// the darting-then-hovering character a bee actually has. Speed rises with
// warmth, so a hot afternoon looks like a hot afternoon.
//
// ── Getting out of the way ────────────────────────────────────────────────
//
// Bees veer off from a looming hand, and these do too: a pointer within reach
// is a repulsion strong enough to override whatever the bee was doing. The
// listeners are passive and on window, and the layer stays pointer-events:none
// throughout — nothing here can intercept a tap. A bee that swallowed a touch
// on a frost warning would be unforgivable decoration; a bee that scatters
// when you reach for the button underneath it is just a bee.

import { useEffect, useRef } from "react";
import type { HiveMood } from "./Hive";
import { aimBee } from "../lib/beeAim";

type Phase = "leaving" | "foraging" | "returning" | "resting";

interface Bee {
  x: number; y: number;      // viewport fractions
  vx: number; vy: number;    // fractions per second
  phase: Phase;
  /// Where this trip is headed, or the door on the way back.
  tx: number; ty: number;
  /// Seconds left in the current phase.
  timer: number;
  buzz: number;              // wing-phase offset, so they do not pulse in step
  scale: number;
  /// Per-bee speed variation — a hive is not a formation.
  vigour: number;
}

/// Where the skep actually is, read from the rendered element rather than
/// assumed. The rail collapses and expands and the hive moves with it, so a
/// hardcoded corner would have bees flying home to the wrong place — or, at
/// lower-left, home to a spot underneath the rail.
const HIVE_FALLBACK = { x: 0.12, y: 0.9 };

function hivePoint(): { x: number; y: number } {
  const el = document.getElementById("ge-hive");
  if (!el) return HIVE_FALLBACK;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return HIVE_FALLBACK;   // hidden on small screens
  return {
    x: (r.left + r.width * 0.5) / window.innerWidth,
    y: (r.top + r.height * 0.72) / window.innerHeight,   // the door, not the crown
  };
}

/// 0 at the flight threshold, 1 in real working heat.
function activityOf(tempF: number | null): number {
  if (tempF == null) return 0.4;
  return Math.max(0, Math.min(1, (tempF - 55) / 30));
}

function beeCount(mood: HiveMood, activity: number): number {
  if (mood === "closed") return 0;
  if (mood === "quiet") return 1;
  if (mood === "unknown") return 2;
  return 2 + Math.round(activity * 4);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/// Somewhere worth visiting: anywhere but the very edges, and biased away
/// from the hive so a trip is actually a trip.
function patch(hive: { x: number; y: number }): { x: number; y: number } {
  for (let i = 0; i < 8; i++) {
    const p = { x: rnd(0.06, 0.94), y: rnd(0.08, 0.9) };
    if (Math.hypot(p.x - hive.x, p.y - hive.y) > 0.28) return p;
  }
  return { x: rnd(0.45, 0.9), y: rnd(0.1, 0.5) };
}

function spawn(n: number, hive: { x: number; y: number }): Bee[] {
  return Array.from({ length: n }, (_, i) => {
    const t = patch(hive);
    return {
      // Everyone starts at the door and leaves — a trip has a beginning.
      x: hive.x, y: hive.y, vx: 0, vy: 0,
      phase: "resting" as Phase,
      tx: t.x, ty: t.y,
      timer: rnd(0.1, 2.5) + i * 0.35,   // stagger the departures
      buzz: rnd(0, 6.28),
      scale: rnd(0.85, 1.3),
      vigour: rnd(0.8, 1.25),
    };
  });
}

export default function Bees({
  mood = "unknown", tempF = null, enabled = true,
}: { mood?: HiveMood; tempF?: number | null; enabled?: boolean }) {
  // Respawn only when the NUMBER of bees would change, never merely because
  // the temperature moved a degree.
  const beeTier = enabled ? beeCount(mood, activityOf(tempF)) : 0;
  const layer = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number>(0);
  const pointer = useRef<{ x: number; y: number; until: number } | null>(null);
  // Warmth is read live from a ref, not closed over. Putting tempF in the
  // effect's deps respawned the whole flight every time the frost reading
  // landed — every bee teleported back to the hive and restarted its stagger
  // timer, which is exactly what "the bees look idle" looks like.
  const activityRef = useRef(activityOf(tempF));
  activityRef.current = activityOf(tempF);

  // Track the pointer so bees can get out of its way. Passive, on window, and
  // never preventDefault — this must not alter a single interaction.
  useEffect(() => {
    const mark = (e: PointerEvent) => {
      pointer.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
        // A touch is a moment, not a position: keep scattering briefly after
        // the finger lifts, which is what makes it read as a startle.
        until: performance.now() + (e.type === "pointerdown" ? 900 : 260),
      };
    };
    window.addEventListener("pointermove", mark, { passive: true });
    window.addEventListener("pointerdown", mark, { passive: true });
    return () => {
      window.removeEventListener("pointermove", mark);
      window.removeEventListener("pointerdown", mark);
    };
  }, []);

  useEffect(() => {
    const host = layer.current;
    if (!host) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const activity = activityRef.current;
    const n = beeCount(mood, activity);
    host.replaceChildren();
    if (!n) return;

    // Re-read the hive whenever the flight restarts, so collapsing the rail
    // moves home rather than stranding it.
    let hive = hivePoint();
    const bees = spawn(n, hive);
    const nodes: HTMLDivElement[] = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;left:0;top:0;pointer-events:none;will-change:transform;" +
        `font-size:${11 + bees[i].scale * 4}px;line-height:1;user-select:none;opacity:.55;`;
      el.textContent = "🐝";
      el.setAttribute("aria-hidden", "true");
      host.appendChild(el);
      nodes.push(el);
    }

    // Reduced motion CALMS the flight rather than stopping it. A frozen
    // instrument has lost its second channel entirely, and the setting asks to
    // reduce motion, not to eliminate it — so they cruise slowly, buzz gently,
    // and still scatter from a hand.
    const calm = reduced ? 0.4 : 1;

    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const ptr = pointer.current && pointer.current.until > now ? pointer.current : null;

      // Read warmth every frame so a temperature that arrives mid-flight
      // speeds them up rather than restarting them.
      const act = activityRef.current;
      // A foraging bee works a patch; it does not race. These are tuned so a
      // trip across the screen takes the better part of ten seconds at full
      // heat rather than three — the earlier numbers read as agitation.
      const CRUISE = (0.055 + act * 0.075) * calm;
      const ACCEL = (0.5 + act * 0.5) * calm;
      const DRAG = 3.0;
      const FLEE_RADIUS = 0.13;
      const FLEE_FORCE = 3.2;

      bees.forEach((b, i) => {
        b.timer -= dt;

        // ── Phase transitions: the trip ────────────────────────────────
        if (b.phase === "resting" && b.timer <= 0) {
          const p = patch(hive);
          b.tx = p.x; b.ty = p.y;
          b.phase = "leaving";
        } else if (b.phase === "leaving" && Math.hypot(b.tx - b.x, b.ty - b.y) < 0.05) {
          b.phase = "foraging";
          b.timer = rnd(6, 16);             // stay and work it
        } else if (b.phase === "foraging" && b.timer <= 0) {
          b.phase = "returning";
          hive = hivePoint();          // it may have moved while they were out
          b.tx = hive.x; b.ty = hive.y;
        } else if (b.phase === "returning" && Math.hypot(b.tx - b.x, b.ty - b.y) < 0.035) {
          b.phase = "resting";
          b.timer = rnd(1.5, 4.5);          // unload at the door
          b.vx *= 0.2; b.vy *= 0.2;
        }

        // ── Steering ───────────────────────────────────────────────────
        let ax = 0, ay = 0;

        if (b.phase === "foraging") {
          // Working a patch: short darts to nearby flowers, then a hover.
          // Re-targeting on arrival is what produces the stop-start rhythm a
          // bee has and a drifting particle does not.
          if (Math.hypot(b.tx - b.x, b.ty - b.y) < 0.02) {
            // Short hops between neighbouring flowers, with a pause at each.
            b.tx = Math.min(Math.max(b.x + rnd(-0.045, 0.045), 0.04), 0.96);
            b.ty = Math.min(Math.max(b.y + rnd(-0.035, 0.035), 0.06), 0.94);
          }
        }

        if (b.phase !== "resting") {
          const dx = b.tx - b.x, dy = b.ty - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const eager = b.phase === "foraging" ? 0.45 : 1.15;
          ax += (dx / d) * ACCEL * eager * b.vigour;
          ay += (dy / d) * ACCEL * eager * b.vigour;
        }

        // ── Get out of the way ─────────────────────────────────────────
        if (ptr) {
          const dx = b.x - ptr.x, dy = b.y - ptr.y;
          const d = Math.hypot(dx, dy);
          if (d < FLEE_RADIUS && d > 0.0001) {
            // Falls off with distance, and hard enough to overrule the trip.
            const push = FLEE_FORCE * (1 - d / FLEE_RADIUS) ** 2;
            ax += (dx / d) * push;
            ay += (dy / d) * push;
            if (b.phase === "resting") { b.phase = "leaving"; const p = patch(hive); b.tx = p.x; b.ty = p.y; }
          }
        }

        b.vx += ax * dt; b.vy += ay * dt;
        b.vx -= b.vx * DRAG * dt; b.vy -= b.vy * DRAG * dt;

        // Cap at cruise, except while fleeing — a startled bee is quick.
        const speed = Math.hypot(b.vx, b.vy);
        const cap = ptr ? CRUISE * 3.4 : CRUISE * (b.phase === "foraging" ? 0.5 : 1.1);
        if (speed > cap) { b.vx = (b.vx / speed) * cap; b.vy = (b.vy / speed) * cap; }

        b.x += b.vx * dt; b.y += b.vy * dt;

        if (b.x < 0.02) { b.x = 0.02; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x > 0.98) { b.x = 0.98; b.vx = -Math.abs(b.vx) * 0.5; }
        if (b.y < 0.04) { b.y = 0.04; b.vy = Math.abs(b.vy) * 0.5; }
        if (b.y > 0.96) { b.y = 0.96; b.vy = -Math.abs(b.vy) * 0.5; }

        // ── Render ─────────────────────────────────────────────────────
        // The buzz is visual only — it never enters the physics, or the bee
        // would jitter its way across the screen. Amplitude and rate rise with
        // warmth, which is the second channel of the reading.
        const t = now / 1000;
        const amp = (0.0007 + act * 0.0016) * calm * (b.phase === "resting" ? 0.3 : 1);
        const rate = (22 + act * 26) * calm;
        const jx = amp * Math.sin(t * rate + b.buzz);
        const jy = amp * Math.cos(t * rate * 1.37 + b.buzz);

        // Face the flight path. The physics is untouched — this only decides
        // which way the drawing points along a vector it did not choose.
        const tilt = speed > 0.004 ? Math.atan2(b.vy, b.vx) * (180 / Math.PI) : 0;
        const aim = aimBee(tilt);

        nodes[i].style.transform =
          `translate(${(b.x + jx) * 100}vw, ${(b.y + jy) * 100}vh) ` +
          `rotate(${aim.rotate}deg) ` +
          `scale(${aim.mirror ? -b.scale : b.scale}, ${b.scale})`;
      });

      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [mood, beeTier, enabled]);

  return (
    <div
      ref={layer}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[500] overflow-hidden"
    />
  );
}
