// Balance and sign-out — the two account facts that used to sit in the top bar.
//
// They moved here because neither is touched often enough to earn permanent
// chrome, and the rail foot they vacated is where the skep belongs. What the
// bar showed at a glance the account page now shows in full: the balance, and
// what today has drawn against it.

export default function AccountSummary({
  balanceSats, spentToday, onSignOut,
}: {
  balanceSats: number | null;
  spentToday: number | null;
  onSignOut: () => void;
}) {
  return (
    <section className="mb-4 rounded-md border border-rule bg-panel px-4 py-3.5">
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
        <button
          onClick={onSignOut}
          className="ml-auto min-h-11 rounded-full border border-rule px-3.5 text-[12px] text-ink-soft active:bg-band"
        >
          Sign out
        </button>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
        Pre-funded, so nothing interrupts you mid-season. Every answer shows what it drew.
      </p>
    </section>
  );
}
