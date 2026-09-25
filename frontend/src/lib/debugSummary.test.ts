import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GOOD_EARTH_TOOLS, callLine, resultLine } from "./debugSummary.ts";

const FARM = { lat: 42.36512, lon: -71.10432 };
const POLYGON = {
  type: "Polygon",
  coordinates: [[[-71.10432, 42.36512], [-71.1031, 42.3655], [-71.1029, 42.3641], [-71.10432, 42.36512]]],
};

test("every tool mcp.ts calls is on the quiet list", () => {
  // A tool missing here is logged raw by the package — answer, centroid and all.
  const src = readFileSync(new URL("./mcp.ts", import.meta.url), "utf8");
  const called = new Set([...src.matchAll(/callTool(?:<[^>]*>)?\(\s*"([a-z_]+)"/g)].map((m) => m[1]));
  assert.ok(called.size > 20, `found only ${called.size} calls — the pattern no longer matches mcp.ts`);
  for (const t of called) assert.ok(GOOD_EARTH_TOOLS.includes(t), `${t} is not on the quiet list`);
});

test("a saved polygon is logged as its shape, never its coordinates", () => {
  const line = callLine("goodearth_block_save", { name: "Home", geometry: POLYGON });
  assert.equal(line, 'goodearth_block_save({"name":"Home","geometry":"polygon of 4 points"})');
  assert.doesNotMatch(line, /42\.36|71\.10/);
});

test("a pin is logged as a pin", () => {
  const line = callLine("goodearth_block_save", { name: "Hive", geometry: { ...FARM, radius_m: 30 } });
  assert.match(line, /"geometry":"pin"/);
  assert.doesNotMatch(line, /42\.36|71\.10/);
});

test("the answer's region never reaches the log", () => {
  const answer = {
    success: true, as_of: "2026-09-25",
    region: { kind: "polygon", centroid: FARM, bbox: { min_lat: 42.36, min_lon: -71.1, max_lat: 42.37, max_lon: -71.09 } },
    first_frost: { median: "2026-10-12" },
  };
  const { failed, message } = resultLine("goodearth_frost_window", answer);
  assert.equal(failed, false);
  assert.equal(message, 'goodearth_frost_window → {"success":true}');
});

test("a feed URL, which holds its token in the path, is not logged", () => {
  const { message } = resultLine("goodearth_calendar_dataset", {
    success: true, url: "https://goodearth.example/calendar/abc123.ics", total: 12,
  });
  assert.doesNotMatch(message, /abc123/);
  assert.match(message, /"total":12/);
});

test("a refusal keeps the fields the panel reads to flag it", () => {
  const { failed, message } = resultLine("goodearth_almanac", {
    success: false, error_code: "insufficient_balance", error: "Top up to read this.",
  });
  assert.equal(failed, true);
  assert.match(message, /"success":false/);
  assert.match(message, /"error_code":"insufficient_balance"/);
});
