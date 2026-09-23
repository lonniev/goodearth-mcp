// Session-key claim visibility and hand-off helpers (#162).
// Run with: node --experimental-strip-types --test frontend/src/lib/sessionKeyClaim.test.ts
//
// Pins the hard requirement: the widget appears ONLY when the browser holds
// the key for the signed-in npub. NIP-07 / courier sign-in → nothing.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SESSION_KEY_ENV_FILENAME,
  passwordManagerOutcomeLabel,
  sessionKeyClaimVisible,
  sessionKeyEnvContents,
} from "./sessionKeyClaim.ts";

const NPUB_A =
  "npub16qarmz80zwag03nhvgz67903glq9qams632834zy4h3ha3klfycqyn35wf";
const NPUB_B =
  "npub1sn0wdenkukak0d9dfczze4k2vx40yxj6q9aspp6t30mmgpz44yfs7s8f0w";

describe("sessionKeyClaimVisible (#162)", () => {
  it("is true only when the browser holds the key for the signed-in npub", () => {
    assert.equal(
      sessionKeyClaimVisible({
        hasSessionNsec: true,
        sessionNsecNpub: NPUB_A,
        signedInNpub: NPUB_A,
      }),
      true,
    );
  });

  it("is false when there is no session nsec (NIP-07 / courier proof)", () => {
    assert.equal(
      sessionKeyClaimVisible({
        hasSessionNsec: false,
        sessionNsecNpub: null,
        signedInNpub: NPUB_A,
      }),
      false,
    );
  });

  it("is false when the held key belongs to a different npub", () => {
    assert.equal(
      sessionKeyClaimVisible({
        hasSessionNsec: true,
        sessionNsecNpub: NPUB_B,
        signedInNpub: NPUB_A,
      }),
      false,
    );
  });

  it("is false when signed-in npub is empty or the held npub is missing", () => {
    assert.equal(
      sessionKeyClaimVisible({
        hasSessionNsec: true,
        sessionNsecNpub: NPUB_A,
        signedInNpub: "",
      }),
      false,
    );
    assert.equal(
      sessionKeyClaimVisible({
        hasSessionNsec: true,
        sessionNsecNpub: null,
        signedInNpub: NPUB_A,
      }),
      false,
    );
    assert.equal(
      sessionKeyClaimVisible({
        hasSessionNsec: false,
        sessionNsecNpub: NPUB_A,
        signedInNpub: NPUB_A,
      }),
      false,
    );
  });
});

describe("sessionKeyEnvContents (#162)", () => {
  it("writes GOODEARTH_NSEC=… with a trailing newline and no other fields", () => {
    const nsec = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsr4j00";
    const body = sessionKeyEnvContents(nsec);
    assert.equal(body, `GOODEARTH_NSEC=${nsec}\n`);
    assert.equal(SESSION_KEY_ENV_FILENAME, "goodearth-nsec.env");
  });
});

describe("passwordManagerOutcomeLabel (#162)", () => {
  it("never claims an OS keychain write succeeded", () => {
    for (const o of ["stored", "prompted", "unsupported"] as const) {
      const label = passwordManagerOutcomeLabel(o);
      // May mention keychain only to deny writing there — never claim success.
      assert.doesNotMatch(label, /stored (it )?in (an? )?(OS )?keychain/i);
      assert.doesNotMatch(label, /wrote to (the )?(OS )?keychain/i);
      assert.doesNotMatch(label, /saved to (Keychain|libsecret|Credential Manager)/i);
      assert.ok(label.length > 0);
    }
    assert.match(passwordManagerOutcomeLabel("prompted"), /cannot do that/i);
  });
});

describe("SessionKeyClaim source contract (#162)", () => {
  it("gates render on sessionKeyClaimVisible and never paints the nsec on load", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/SessionKeyClaim.tsx"), "utf8");

    // Visibility rule must drive the early return — no placeholder when hidden.
    assert.match(src, /sessionKeyClaimVisible/);
    assert.match(src, /return null/);
    assert.match(src, /hasSessionNsec/);
    assert.match(src, /sessionNsecNpub/);

    // Deliberate second step before the key is shown or used.
    assert.match(src, /[Rr]eveal|[Ss]how (my |the )?key|Claim your/);

    // Four destinations named in the issue.
    assert.match(src, /[Cc]opy/);
    assert.match(src, /\.env|GOODEARTH_NSEC|sessionKeyEnvContents/);
    assert.match(src, /[Pp]assword/);
    assert.match(src, /[Dd]M|Courier|npub/);

    // Must not console.log / debugPush the nsec value.
    assert.doesNotMatch(src, /console\.(log|debug|info|warn|error)\([^)]*nsec/i);
    assert.doesNotMatch(src, /debugPush\([^)]*getSessionNsec/);
  });
});
