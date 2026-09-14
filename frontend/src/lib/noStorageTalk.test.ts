// A grower is never told where their data is kept.
//
// The owner, 2026-09-14: "the storage locations are user-irrelevant. There's
// no need to mention the details." About said a grower's records "stay on
// your device", which had stopped being true when the record moved to the
// server — and the fix was not to correct the sentence but to remove it. What
// a grower can DO with their record is theirs to know; which machine holds it
// is not.
//
// Reads the text of every view and component, code comments removed and line
// breaks folded, so a sentence split across two lines of JSX is still one
// sentence. It looks for a verb of KEEPING beside a place — "Subscribe on this
// device" is something to do, not somewhere data sits.
// Run: node --experimental-strip-types --test src/lib/noStorageTalk.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const TALK =
  /\b(stays?|kept|stored|saved|lives?|remembered|held)( only)? (on|in) (your|this|the) (device|browser|phone|tablet|laptop|server|cloud|nostr|relays?|database)\b/gi;

/// Saying the secret KEY never leaves the browser is a promise about the
/// grower's safety, not a note about where records live. It stays.
const ABOUT_THE_KEY = /\bnsec\b|secret key|private key/i;

const strip = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/\s+/g, " ");

function files(dir: string): string[] {
  const root = new URL(`../${dir}/`, import.meta.url);
  return readdirSync(root).filter((f) => f.endsWith(".tsx")).map((f) => new URL(f, root).pathname);
}

export function storageTalk(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TALK)) {
    const around = text.slice(Math.max(0, m.index - 160), m.index + m[0].length + 40);
    if (!ABOUT_THE_KEY.test(around)) out.push(around.trim());
  }
  return out;
}

describe("what a grower reads", () => {
  it("never says where their data is kept", () => {
    const found: string[] = [];
    for (const path of [...files("views"), ...files("components")]) {
      for (const hit of storageTalk(strip(readFileSync(path, "utf8"))))
        found.push(`${path.split("/src/")[1]}: …${hit}…`);
    }
    assert.deepEqual(found, [], `storage talk in grower-facing text:\n${found.join("\n")}`);
  });

  it("catches the sentences it was written for, even split across lines", () => {
    for (const s of [
      "Your regions, crops, pests, wildlife and field reports stay on your\n device",
      "Kept on this device — a preference for the tablet in the shed",
      "Your notes are stored on the server",
    ]) assert.equal(storageTalk(strip(s)).length, 1, s);
  });

  it("leaves an action, and a promise about the secret key, alone", () => {
    assert.deepEqual(storageTalk("Subscribe on this device"), []);
    assert.deepEqual(storageTalk("Your nsec stays in this browser and signs each call inline."), []);
  });
});
