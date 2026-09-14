import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fullscreenMode } from "./fullscreen.ts";

describe("what the full-screen button does", () => {
  it("toggles full screen wherever the browser allows it", () => {
    // Desktop, Android, iPad Safari.
    assert.equal(fullscreenMode({ apiEnabled: true, standalone: false, iphone: false }), "toggle");
  });

  it("explains Add to Home Screen on an iPhone, which cannot go full screen", () => {
    assert.equal(fullscreenMode({ apiEnabled: false, standalone: false, iphone: true }), "install");
  });

  it("stays away once the site already runs from the Home Screen", () => {
    assert.equal(fullscreenMode({ apiEnabled: false, standalone: true, iphone: true }), "none");
  });

  it("stays away where there is neither a way nor an iPhone to explain", () => {
    assert.equal(fullscreenMode({ apiEnabled: false, standalone: false, iphone: false }), "none");
  });
});
