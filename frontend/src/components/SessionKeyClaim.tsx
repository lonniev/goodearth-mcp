// Claim your session key — Profile widget for a browser-held nsec (#162).
//
// Renders ONLY when this browser holds the session nsec for the signed-in
// npub. NIP-07 and courier-proof sign-ins see nothing: no disabled control,
// no placeholder, no mention. Reveal takes a deliberate second step so a
// Profile page opened in front of other people does not paint the key.
//
// Destinations: copy, download .env, password-manager prompt, Secure Courier
// DM to another npub the grower names. The nsec never reaches a log, error
// text, analytics call, or MCP tool argument.

import { useRef, useState, type ReactNode } from "react";
import {
  getSessionNsec,
  getSessionNsecBytes,
  hasSessionNsec,
  sessionNsecNpub,
} from "../lib/sessionNsec";
import {
  SESSION_KEY_ENV_FILENAME,
  passwordManagerOutcomeLabel,
  sessionKeyClaimVisible,
  sessionKeyEnvContents,
  type PasswordManagerOutcome,
} from "../lib/sessionKeyClaim";
import { sendSessionKeyDm } from "../lib/sessionKeyDm";
import { shareOrDownload } from "../lib/shareFile";

type Flash = { tone: "ok" | "err"; text: string };

export default function SessionKeyClaim({ npub }: { npub: string }) {
  const visible = sessionKeyClaimVisible({
    hasSessionNsec: hasSessionNsec(),
    sessionNsecNpub: sessionNsecNpub(),
    signedInNpub: npub,
  });

  // Hard requirement: silence when the browser does not hold the key.
  if (!visible) return null;

  return <SessionKeyClaimInner />;
}

function SessionKeyClaimInner() {
  const [revealed, setRevealed] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const userRef = useRef<HTMLInputElement | null>(null);
  const passRef = useRef<HTMLInputElement | null>(null);

  function nsecOrThrow(): string {
    const nsec = getSessionNsec();
    if (!nsec) throw new Error("No session key in this browser.");
    return nsec;
  }

  function note(tone: Flash["tone"], text: string) {
    // Deliberately never interpolate the nsec into flash text.
    setFlash({ tone, text });
  }

  async function copyKey() {
    setBusy(true);
    setFlash(null);
    try {
      const nsec = nsecOrThrow();
      await navigator.clipboard.writeText(nsec);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      note("ok", "Copied. It is on your clipboard only — paste it somewhere you trust.");
    } catch {
      note("err", "Could not copy. Your browser may have blocked the clipboard.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadEnv() {
    setBusy(true);
    setFlash(null);
    try {
      const nsec = nsecOrThrow();
      const body = sessionKeyEnvContents(nsec);
      const file = new File([body], SESSION_KEY_ENV_FILENAME, {
        type: "text/plain",
      });
      const outcome = await shareOrDownload(file, "Good Earth session key");
      if (outcome === "cancelled") {
        note("ok", "Share cancelled — nothing left this page.");
      } else if (outcome === "blocked") {
        note(
          "err",
          "The share sheet needs a fresh tap. Try Download again.",
        );
      } else if (outcome === "shared") {
        note("ok", "Handed off via the share sheet.");
      } else {
        note(
          "ok",
          `Downloaded ${SESSION_KEY_ENV_FILENAME}. Import it yourself — the page did not write to any keychain.`,
        );
      }
    } catch {
      note("err", "Could not prepare the download.");
    } finally {
      setBusy(false);
    }
  }

  async function passwordManagerSave() {
    setBusy(true);
    setFlash(null);
    try {
      const nsec = nsecOrThrow();
      const outcome = await offerPasswordManager(
        nsec,
        npubHint(),
        formRef.current,
        userRef.current,
        passRef.current,
      );
      note("ok", passwordManagerOutcomeLabel(outcome));
    } catch {
      note("err", passwordManagerOutcomeLabel("unsupported"));
    } finally {
      setBusy(false);
    }
  }

  function npubHint(): string {
    // Username for a password manager entry — the public npub, never secret.
    return sessionNsecNpub() ?? "goodearth-session";
  }

  async function sendDm() {
    setBusy(true);
    setFlash(null);
    try {
      const nsec = nsecOrThrow();
      const to = recipient.trim();
      if (!to.startsWith("npub1") || to.length < 60) {
        note("err", "Enter the recipient as an npub1… address.");
        return;
      }
      const result = await sendSessionKeyDm({
        nsecBytes: getSessionNsecBytes(),
        nsecBech32: nsec,
        recipientNpub: to,
      });
      if (result.ok > 0) {
        note(
          "ok",
          `Encrypted DM accepted by ${result.ok}/${result.total} relays. Open it from the recipient’s Nostr client.`,
        );
        setDmOpen(false);
        setRecipient("");
      } else {
        note(
          "err",
          "No relay accepted the encrypted DM. Try again in a moment.",
        );
      }
    } catch (e) {
      // Message must stay free of the nsec — our thrown errors already are.
      const msg = (e as Error).message || "Could not send the DM.";
      note("err", msg.includes("nsec") ? "Could not send the DM." : msg);
    } finally {
      setBusy(false);
    }
  }

  if (!revealed) {
    return (
      <div className="rounded-xl border border-rule bg-panel px-4 py-3">
        <div className="eyebrow mb-1">Session key</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-[14rem] flex-1 text-[12.5px] leading-snug text-ink-soft">
            This browser is holding the secret key that signs you in. Take a copy
            before you clear site data or switch devices — without it, this identity
            is gone.
          </p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="min-h-11 shrink-0 rounded-full border border-ink bg-ink px-4 text-[13px] font-semibold text-paper"
          >
            Claim your session key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-rule bg-panel px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="eyebrow mb-1">Session key</div>
        <button
          type="button"
          onClick={() => {
            setRevealed(false);
            setShowKey(false);
            setDmOpen(false);
            setFlash(null);
            setRecipient("");
          }}
          className="text-[12px] text-ink-soft hover:text-ink"
        >
          Hide
        </button>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
        Anyone who holds this key is you. It leaves this page only when you
        choose a destination below — never logged, never sent to Good Earth.
      </p>

      {showKey ? (
        <div className="mb-3 break-all rounded-lg border border-rule bg-white px-3 py-2 font-mono text-[12px] text-ink">
          {/* Shown only after an explicit "Show" — still a deliberate step. */}
          {getSessionNsec()}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowKey(true)}
          className="mb-3 text-[12.5px] text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Show the key on screen
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        <DestButton onClick={() => void copyKey()} disabled={busy}>
          {copied ? "Copied" : "Copy"}
        </DestButton>
        <DestButton onClick={() => void downloadEnv()} disabled={busy}>
          Download .env
        </DestButton>
        <DestButton onClick={() => void passwordManagerSave()} disabled={busy}>
          Password manager
        </DestButton>
        <DestButton
          onClick={() => {
            setDmOpen((v) => !v);
            setFlash(null);
          }}
          disabled={busy}
          active={dmOpen}
        >
          Send by DM
        </DestButton>
      </div>

      {dmOpen && (
        <div className="mt-3 space-y-2 rounded-lg border border-rule bg-white p-3">
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Encrypts the key to an npub you own and publishes the sealed message
            to public relays. Only that npub can open it.
          </p>
          <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[16rem] flex-1 text-[12px] text-ink-soft">
            Recipient npub
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="npub1…"
              className="data mt-1 h-11 w-full rounded border border-rule bg-panel px-2.5 font-mono text-[13px] text-ink focus:border-honey focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void sendDm()}
            disabled={busy || recipient.trim().length < 60}
            className="min-h-11 shrink-0 rounded-full border border-ink bg-ink px-4 text-[13px] font-semibold text-paper disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send encrypted DM"}
          </button>
          </div>
        </div>
      )}

      {/*
        Hidden password form — submitting it is the honest "password manager
        prompt" path when the Credential Management API is missing. Never claim
        an OS keychain write.
      */}
      <form
        ref={formRef}
        className="absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input
          ref={userRef}
          name="username"
          autoComplete="username"
          defaultValue=""
          readOnly
          tabIndex={-1}
        />
        <input
          ref={passRef}
          name="password"
          type="password"
          autoComplete="new-password"
          defaultValue=""
          readOnly
          tabIndex={-1}
        />
      </form>

      {flash && (
        <p
          className={`mt-3 text-[12.5px] leading-relaxed ${
            flash.tone === "ok" ? "text-ink" : "text-clay"
          }`}
          role="status"
        >
          {flash.text}
        </p>
      )}
    </div>
  );
}

function DestButton({
  onClick,
  disabled,
  active,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium disabled:opacity-40 ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule text-ink-soft active:bg-band"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Offer the key to a browser password manager. Never claims an OS keychain.
 * Uses PasswordCredential when available; otherwise fills a hidden form and
 * submits it so the browser can offer a save prompt.
 */
async function offerPasswordManager(
  nsec: string,
  username: string,
  form: HTMLFormElement | null,
  user: HTMLInputElement | null,
  pass: HTMLInputElement | null,
): Promise<PasswordManagerOutcome> {
  type PasswordCredCtor = new (opts: {
    id: string;
    password: string;
    name?: string;
  }) => Credential;
  const Cred = (window as unknown as { PasswordCredential?: PasswordCredCtor })
    .PasswordCredential;
  if (Cred && navigator.credentials?.store) {
    try {
      const cred = new Cred({
        id: username,
        password: nsec,
        name: "Good Earth session key",
      });
      await navigator.credentials.store(cred);
      return "stored";
    } catch {
      // Fall through to the form prompt.
    }
  }

  // Form-based prompt — best-effort. Many browsers ignore programmatic submit
  // for save prompts; we still report honestly that we only prompted.
  if (form && user && pass) {
    user.value = username;
    pass.value = nsec;
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
    // Clear the DOM value immediately so a later inspect does not show it.
    pass.value = "";
    return "prompted";
  }
  return "unsupported";
}
