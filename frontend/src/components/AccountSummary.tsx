// Balance and sign-out — the two account facts that used to sit in the top bar.
//
// They moved here because neither is touched often enough to earn permanent
// chrome, and the rail foot they vacated is where the skep belongs. What the
// bar showed at a glance the account page now shows in full: the balance, and
// what today has drawn against it — and the way to add to it.
//
// The top-up is the package's (`useTopUp`): purchase_credits → a Lightning
// invoice → check_payment, checked on its own every few seconds until it
// settles, with "I've paid" for anyone who would rather not wait.

import { useTopUp } from "@tollbooth-dpyc/web/react";
import { tour } from "../lib/tour/targets";

/// Round amounts to pay in. Choosing one makes the invoice; nothing here
/// guesses what a season of answers costs.
const TOP_UPS = [1_000, 5_000, 20_000];

const chip = "min-h-11 flex-1 rounded-full border border-rule text-[12.5px] active:bg-band disabled:opacity-40";

export default function AccountSummary({
  balanceSats, spentToday, onSignOut, onToppedUp,
}: {
  balanceSats: number | null;
  spentToday: number | null;
  onSignOut: () => void;
  /** An invoice settled: read the balance again. */
  onToppedUp: () => void;
}) {
  const { state, create, check, cancel } = useTopUp({ onSettled: onToppedUp });
  const busy = state.phase === "creating" || (state.phase === "awaiting" && state.checking);
  const invoice = state.phase === "awaiting" ? state.invoice : null;
  const msg =
    state.phase === "settled" ? `Paid. ${state.credited.toLocaleString()} sats added.`
    : state.phase === "failed" ? state.message
    : state.phase === "awaiting" && state.status ? `Not paid yet. The invoice reads ${state.status}.`
    : state.phase === "idle" ? (state.message ?? "")
    : "";

  return (
    <section className="rounded-xl border border-rule bg-panel px-4 py-3" {...tour("account.summary")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[19px] leading-none text-honey">⚡</span>
        <b className="figure text-[22px] leading-none">
          {balanceSats == null ? "—" : balanceSats.toLocaleString()}
          <small className="ml-1.5 text-[0.5em] font-normal text-ink-soft">sats</small>
        </b>
        {spentToday != null && spentToday > 0 && (
          <span className="data rounded-full bg-band px-2.5 py-1 text-[10.5px] text-ink-soft">
            {spentToday.toLocaleString()} drawn today
          </span>
        )}
        <p className="min-w-[12rem] flex-1 text-[11.5px] leading-snug text-ink-soft">
          Pre-funded, so nothing interrupts you mid-season. Every answer shows what it drew.
        </p>
        <button
          onClick={onSignOut}
          className="min-h-11 rounded-full border border-rule px-3.5 text-[12px] text-ink-soft active:bg-band"
        >
          Sign out
        </button>
      </div>

      {!invoice ? (
        <div className="mt-3 flex items-center gap-2" {...tour("account.topup")}>
          <span className="text-[11.5px] text-ink-soft">Top up</span>
          {TOP_UPS.map((n) => (
            <button key={n} disabled={busy} onClick={() => create(n)} className={chip}>
              +{n.toLocaleString()}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <a
            href={invoice.checkoutLink ?? (invoice.bolt11 ? `lightning:${invoice.bolt11}` : "#")}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center rounded bg-ink text-[13px] font-semibold text-paper"
          >
            ⚡ Pay {invoice.sats.toLocaleString()} sats
          </a>
          <div className="flex gap-2">
            <button disabled={busy} onClick={check} className={chip}>I've paid · check</button>
            <button onClick={cancel} className={`${chip} flex-none px-4`}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-[11.5px] leading-snug text-ink-soft">{msg}</p>}
    </section>
  );
}
