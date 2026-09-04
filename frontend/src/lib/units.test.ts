// A degree-day is an interval, not a point. Everything here is that one fact.

import assert from "node:assert/strict";
import { test } from "node:test";
import { degreeDays, showDD, showTemp, temp, toF, type Unit } from "./units.ts";

test("Fahrenheit is the wire, so it passes through untouched", () => {
  assert.equal(temp(50, "F"), 50);
  assert.equal(degreeDays(1000, "F"), 1000);
  assert.equal(toF(50, "F"), 50);
});

test("a temperature carries the 32-degree offset", () => {
  assert.equal(temp(32, "C"), 0);
  assert.equal(temp(212, "C"), 100);
  assert.equal(Math.round(temp(50, "C")), 10);
});

test("a degree-day total does NOT carry the offset", () => {
  // 1000 GDD°F is 556 GDD°C. Through the temperature conversion it would read
  // 538 — a season understated by 18 degree-days, every time.
  assert.equal(Math.round(degreeDays(1000, "C")), 556);
  assert.notEqual(Math.round(degreeDays(1000, "C")), Math.round(temp(1000, "C")));
});

test("what a person types comes back as the Fahrenheit the record keeps", () => {
  for (const unit of ["F", "C"] as Unit[]) {
    for (const f of [32, 43, 50, 68]) {
      assert.ok(Math.abs(toF(temp(f, unit), unit) - f) < 1e-9, `${f} in ${unit}`);
    }
  }
});

test("a zero base temperature in Celsius is 32 °F, not 0", () => {
  // The obvious mistake: treating an input as an interval. A grower entering
  // a base of 10 °C means 50 °F, and the service would refuse 10.
  assert.equal(toF(10, "C"), 50);
});

test("the suffix says which scale, and never wraps away from its number", () => {
  assert.equal(showTemp(50, "F"), "50 °F");
  assert.equal(showTemp(50, "C"), "10 °C");
  assert.equal(showDD(1850, "F"), "1,850 GDD");
  assert.ok(showDD(1850, "C").endsWith("GDD°C"));
});
