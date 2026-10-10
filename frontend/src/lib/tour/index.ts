// A page's tour as driver.js runs it.
//
// driver.js draws the popover and the cutout; this file turns a `Tour` into
// its configuration and adds the two things it does not have: a page action
// before a step whose control has to be opened first, and a "Stop the
// tutorial" link in every popover.

import { driver, type DriveStep } from "driver.js";
import { selector } from "./targets.ts";
import type { Tour } from "./types.ts";

export interface TourRun {
  start(): void;
  /// Take the tour down. `silent` is for the page leaving under it, which
  /// says nothing about whether the grower wanted it.
  stop(silent?: boolean): void;
}

export interface TourHooks {
  /// Do what a step asks for before it is pointed at: open a form, pick a tag.
  run(action: string): void | Promise<void>;
  /// The tour ended by its last step or its ✕: this page is done.
  onEnd(): void;
  /// "Stop the tutorial": off on every page.
  onStop(): void;
}

/// How long to wait for a control that a page action is still opening.
const WAIT_MS = 1500;

/// Whether a step's control is on the page right now.
function present(s: Tour["steps"][number]): boolean {
  return typeof s.target === "string" ? !!document.querySelector(selector(s.target)) : !!s.target();
}

export function buildTour(tour: Tour, hooks: TourHooks): TourRun {
  let silent = false;
  const steps: DriveStep[] = tour.steps.map((s) => ({
    // driver.js types a finder as returning an Element; one that finds
    // nothing returns null, which it treats as a missing element and skips.
    element: typeof s.target === "string" ? selector(s.target) : (s.target as () => Element),
    popover: {
      title: s.title,
      description: s.says,
      side: s.side ?? "bottom",
      align: s.align ?? "start",
    },
  }));

  const d = driver({
    steps,
    popoverClass: "ge-tour",
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    allowClose: true,
    overlayOpacity: 0.45,
    stagePadding: 6,
    stageRadius: 8,
    smoothScroll: true,
    skipMissingElement: true,
    waitForElement: WAIT_MS,
    onPopoverRender(popover) {
      const stop = document.createElement("button");
      stop.type = "button";
      stop.className = "ge-tour-stop";
      stop.textContent = "Stop the tutorial";
      stop.addEventListener("click", () => { silent = true; hooks.onStop(); d.destroy(); });
      popover.wrapper.appendChild(stop);
    },
    async onNextClick() {
      // The next step that can be shown: one whose control is on the page,
      // or one whose page action will put it there. With none left the
      // tour is over — driver.js itself will not step past a missing last
      // element, and left to it the Done button would do nothing.
      const i = d.getActiveIndex() ?? 0;
      const next = tour.steps.slice(i + 1).find((s) => s.before || present(s));
      if (!next) { d.destroy(); return; }
      if (next.before) await hooks.run(next.before);
      d.moveNext();
    },
    onDestroyed() {
      if (!silent) hooks.onEnd();
    },
  });

  return {
    start() {
      const first = tour.steps[0];
      if (first?.before) void Promise.resolve(hooks.run(first.before)).then(() => d.drive());
      else d.drive();
    },
    stop(quiet = true) {
      silent = quiet;
      if (d.isActive()) d.destroy();
    },
  };
}
