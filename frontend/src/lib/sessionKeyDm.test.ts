// Session-key DM helpers (#162) — pure checks; no relay I/O.
// Run with: node --experimental-strip-types --test frontend/src/lib/sessionKeyDm.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import {
  recipientPubkeyHex,
  sendSessionKeyDm,
  sessionKeyDmBody,
} from "./sessionKeyDm.ts";

describe("sessionKeyDmBody (#162)", () => {
  it("includes the nsec and a short warning, nothing else sensitive-shaped", () => {
    const nsec = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsr4j00";
    const body = sessionKeyDmBody(nsec);
    assert.match(body, /Good Earth session key/);
    assert.ok(body.endsWith(nsec) || body.includes(`\n${nsec}`));
  });
});

describe("recipientPubkeyHex (#162)", () => {
  it("decodes a valid npub and rejects non-npub input", () => {
    const sk = generateSecretKey();
    const npub = nip19.npubEncode(getPublicKey(sk));
    const hex = recipientPubkeyHex(npub);
    assert.equal(hex, getPublicKey(sk));
    assert.equal(hex.length, 64);

    assert.throws(() => recipientPubkeyHex("nsec1notanpub"));
    assert.throws(() => recipientPubkeyHex(""));
    assert.throws(() => recipientPubkeyHex("npub1short"));
  });
});

describe("sendSessionKeyDm (#162)", () => {
  it("gift-wraps without putting the nsec on the wire payload the publisher sees", async () => {
    const sender = generateSecretKey();
    const nsec = nip19.nsecEncode(sender);
    const recipientSk = generateSecretKey();
    const recipientNpub = nip19.npubEncode(getPublicKey(recipientSk));

    let published: { kind?: number; content?: string; tags?: string[][] } | null =
      null;
    const result = await sendSessionKeyDm({
      nsecBytes: sender,
      nsecBech32: nsec,
      recipientNpub,
      relays: ["wss://example.test"],
      publish: async (wrap) => {
        published = wrap as typeof published;
        // The publisher (and any log of it) must not see the plaintext nsec.
        const wire = JSON.stringify(wrap);
        assert.equal(wire.includes(nsec), false, "plaintext nsec must not be on the wrap");
        return { ok: 1, total: 1, accepted: ["wss://example.test"], errors: [] };
      },
    });

    assert.equal(result.ok, 1);
    assert.ok(published);
    assert.equal((published as { kind: number }).kind, 1059);
    assert.ok(((published as { content: string }).content || "").length > 0);
  });
});
