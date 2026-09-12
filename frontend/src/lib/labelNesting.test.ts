// No button lives inside a <label>.
//
// A tap on an element inside a label can be handed to the label's input rather
// than the element tapped — the HTML spec discourages the nesting and iPad
// Safari acts on it. On the Crops form a grower tapped "sugar maple" in the
// plant picker, the caret went back into the search box, nothing was chosen,
// and "+ Planting" refused with "pick it from the list". The Stepper's − and +
// and the Field Reports handle list had the same shape.
//
// Reads the shipped source, because the invariant is about markup, and the
// node test runner cannot render a .tsx.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

/// Elements and components that render buttons.
const INTERACTIVE = /<(button|SpeciesPicker|Stepper|RowActions|IconButton|select)\b/;

async function tsxFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await tsxFiles(p));
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("a label wraps only its caption and its input", () => {
  it("never a button, a picker or a stepper", async () => {
    const offenders: string[] = [];
    for (const file of await tsxFiles("src")) {
      const src = await readFile(file, "utf8");
      for (const m of src.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) {
        if (INTERACTIVE.test(m[1])) {
          offenders.push(`${file}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `labels wrapping something tappable: ${offenders.join(", ")}`);
  });
});
