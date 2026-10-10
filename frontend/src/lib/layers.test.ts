// Anything that covers the whole screen must sit above the maps.
//
// Leaflet draws its tiles at z-index 400 and its controls at 1000, in the
// page's own stacking context. A dialog at z-40 is therefore UNDER the plot
// map: the "Forget this plot?" sheet opened beneath the imagery, with the
// tiles painting over its text (iPad, 2026-10-10). The dialogs share a
// backdrop and the frames share a page, so they share one floor here.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SRC = new URL("..", import.meta.url).pathname;
const LEAFLET_PANE = 400;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return f.endsWith(".tsx") ? [p] : [];
  });
}

/// Every class string on an element that is `fixed inset-0`, with the z-index
/// it carries: `z-40` → 40, `z-[900]` → 900, none → 0.
function overlays(src: string): { classes: string; z: number }[] {
  return [...src.matchAll(/"([^"]*\bfixed inset-0\b[^"]*)"/g)].map(([, classes]) => {
    const m = classes.match(/(?<![\w-])z-(?:\[(\d+)\]|(\d+))(?![\w-])/);
    return { classes, z: m ? Number(m[1] ?? m[2]) : 0 };
  });
}

describe("full-screen overlays sit above the maps", () => {
  const files = sources(SRC).filter((p) => !p.endsWith(".test.ts"));
  it("scans the pages and the components", () => {
    assert.ok(files.length > 20);
  });
  for (const p of files) {
    const found = overlays(readFileSync(p, "utf8"));
    if (!found.length) continue;
    it(p.slice(SRC.length), () => {
      for (const { classes, z } of found) {
        assert.ok(z > LEAFLET_PANE, `z-index ${z} is under Leaflet's tiles (${LEAFLET_PANE}): ${classes}`);
      }
    });
  }
  it("reads a bracketed and a bare z-index", () => {
    assert.deepEqual(overlays('className="fixed inset-0 z-[900] flex"')[0].z, 900);
    assert.deepEqual(overlays('className="fixed inset-0 z-40"')[0].z, 40);
    assert.deepEqual(overlays('className="fixed inset-0"')[0].z, 0);
  });
});
