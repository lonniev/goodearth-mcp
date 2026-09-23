// Session-key claim — when may the Profile widget offer the browser-held nsec?
//
// Pure helpers so the visibility rule (#162) is unit-tested under node:test
// without React or localStorage. The hard requirement: show nothing unless
// THIS browser holds the key for the npub that is signed in. A grower on
// NIP-07 or a courier proof must never see a claim that this app holds their
// key.

/** True only when the browser holds the session nsec for the signed-in npub. */
export function sessionKeyClaimVisible(opts: {
  hasSessionNsec: boolean;
  sessionNsecNpub: string | null;
  signedInNpub: string;
}): boolean {
  const signedIn = opts.signedInNpub.trim();
  if (!signedIn) return false;
  if (!opts.hasSessionNsec) return false;
  const held = opts.sessionNsecNpub?.trim() ?? "";
  if (!held) return false;
  return held === signedIn;
}

/** Contents of the downloadable `.env` hand-off. */
export function sessionKeyEnvContents(nsec: string): string {
  return `GOODEARTH_NSEC=${nsec}\n`;
}

/** Suggested download filename for the `.env` hand-off. */
export const SESSION_KEY_ENV_FILENAME = "goodearth-nsec.env";

/**
 * What the password-manager destination may honestly report.
 * A web page cannot write to an OS keychain; say what actually happened.
 */
export type PasswordManagerOutcome =
  | "stored" // Credential Management API accepted a PasswordCredential
  | "prompted" // form submitted so a browser password manager could offer save
  | "unsupported"; // nothing the page can do here

export function passwordManagerOutcomeLabel(o: PasswordManagerOutcome): string {
  switch (o) {
    case "stored":
      return "Offered to your browser’s password manager.";
    case "prompted":
      return "Submitted so your browser’s password manager can offer to save it. Nothing was written to an OS keychain — a web page cannot do that.";
    case "unsupported":
      return "This browser has no password-manager save path the page can reach. Download the .env file or copy the key instead.";
  }
}
