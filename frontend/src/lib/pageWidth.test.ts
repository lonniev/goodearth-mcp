// Every page uses the width of the device it is on.
//
// The Words page sat in a 672 px column on an iPad — half the screen — and
// the guides, the welcome page and the visitor's shell carried the same kind
// of reading-width cap. A cap on a small widget (a search box, the loading
// quote) is fine; a cap on a page or its shell is not.
//
// Reads the shipped source, because the invariant is about markup and the
// node test runner cannot render a .tsx.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

/// The page-sized caps. Arbitrary-value caps (max-w-[14rem]) and the small
/// named ones belong to widgets and are allowed.
const PAGE_CAP = /\bmax-w-(2xl|3xl|4xl|5xl|6xl|7xl|prose|screen-\w+)\b/;

async function files(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith(".tsx")).map((f) => join(dir, f));
}

describe("pages use the whole screen", () => {
  it("no view, and no shell, caps its width", async () => {
    const targets = [
      ...(await files("src/views")),
      "src/components/AppShell.tsx",
      "src/components/GuestShell.tsx",
      "src/components/FirstRun.tsx",
    ];
    const capped: string[] = [];
    for (const f of targets) {
      const src = await readFile(f, "utf8");
      src.split("\n").forEach((line, i) => { if (PAGE_CAP.test(line)) capped.push(`${f}:${i + 1}`); });
    }
    assert.deepEqual(capped, [], `page-width caps: ${capped.join(", ")}`);
  });
});
