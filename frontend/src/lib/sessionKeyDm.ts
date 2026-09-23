// Ship the browser-held session nsec to another npub the grower names.
//
// Client-side only: encrypt (NIP-17 gift wrap over NIP-44), sign, and publish
// the wrap to public relays. The plaintext nsec never enters an MCP tool
// argument, a log line, or an error message — only ciphertext leaves the page.
//
// Why not the wheel's relay transport: publish_nostr_profile accepts kind-0
// only, and there is no patron-facing generic "publish this signed event"
// tool on goodearth. Encryption must happen here anyway (the nsec is the
// sender key and the payload); relay fan-out of an already-signed kind-1059
// is the remaining hop, done with nostr-tools' SimplePool.

import { nip19 } from "nostr-tools";
import { wrapEvent } from "nostr-tools/nip17";
import { SimplePool } from "nostr-tools/pool";

/** Public write relays used for the gift-wrapped DM fan-out. */
export const SESSION_KEY_DM_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://offchain.pub",
] as const;

/** Plaintext body of the DM. Kept short; the nsec is the payload. */
export function sessionKeyDmBody(nsec: string): string {
  return [
    "Your Good Earth session key (nsec).",
    "Anyone who holds it is you — import it only into a client you control.",
    "",
    nsec,
  ].join("\n");
}

export function recipientPubkeyHex(npubBech32: string): string {
  const trimmed = npubBech32.trim();
  if (!trimmed.startsWith("npub1")) {
    throw new Error("Recipient must be an npub1… address.");
  }
  const decoded = nip19.decode(trimmed);
  if (decoded.type !== "npub") {
    throw new Error("Recipient must be an npub1… address.");
  }
  // nostr-tools v2 returns the 32-byte x-only pubkey as a hex string.
  const data = decoded.data;
  if (typeof data === "string" && /^[0-9a-f]{64}$/i.test(data)) return data;
  throw new Error("Could not read that npub.");
}

export interface SessionKeyDmResult {
  ok: number;
  total: number;
  /** Relay URLs that accepted the wrap — never includes plaintext. */
  accepted: string[];
  /** Short per-relay failure notes — never includes plaintext. */
  errors: string[];
}

/**
 * Gift-wrap `nsecBech32` to `recipientNpub` and publish the kind-1059 wrap.
 * Throws on bad input; relay failures are reported in the result, not thrown.
 */
export async function sendSessionKeyDm(opts: {
  nsecBytes: Uint8Array;
  nsecBech32: string;
  recipientNpub: string;
  relays?: readonly string[];
  /** Injected for tests — real path builds a SimplePool. */
  publish?: (wrap: { id: string }, relays: readonly string[]) => Promise<SessionKeyDmResult>;
}): Promise<SessionKeyDmResult> {
  const recipient = recipientPubkeyHex(opts.recipientNpub);
  const body = sessionKeyDmBody(opts.nsecBech32);
  // NIP-17: kind-14 rumor sealed + gift-wrapped to the recipient.
  const wrap = wrapEvent(opts.nsecBytes, { publicKey: recipient }, body);
  const relays = opts.relays ?? SESSION_KEY_DM_RELAYS;

  if (opts.publish) return opts.publish(wrap, relays);

  const pool = new SimplePool();
  const accepted: string[] = [];
  const errors: string[] = [];
  try {
    const pubs = pool.publish([...relays], wrap);
    const settled = await Promise.allSettled(pubs);
    settled.forEach((r, i) => {
      const url = relays[i] ?? `relay-${i}`;
      if (r.status === "fulfilled") accepted.push(url);
      else errors.push(`${url}: refused`);
    });
  } finally {
    try {
      pool.close([...relays]);
    } catch {
      /* pool already quiet */
    }
  }
  return { ok: accepted.length, total: relays.length, accepted, errors };
}
