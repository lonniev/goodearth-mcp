import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handOffMode } from "./shareFile.ts";

describe("where an exported bundle goes", () => {
  it("to the share sheet on a tablet that can share files", () => {
    assert.equal(handOffMode({ canShareFiles: true, coarsePointer: true }), "share");
  });

  it("to a download on Windows 11, though Chrome and Edge offer a share sheet", () => {
    // The tester's case: the sheet exists, the pointer is a mouse. Following
    // the sheet is what made Export look like it did nothing.
    assert.equal(handOffMode({ canShareFiles: true, coarsePointer: false }), "download");
  });

  it("to a download wherever files cannot be shared", () => {
    assert.equal(handOffMode({ canShareFiles: false, coarsePointer: true }), "download");
    assert.equal(handOffMode({ canShareFiles: false, coarsePointer: false }), "download");
  });
});
