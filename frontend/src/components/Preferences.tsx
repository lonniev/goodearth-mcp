// Viewing preferences, on the Account page beside the Nostr profile.

import type { Prefs } from "../lib/prefs";

export default function Preferences({
  prefs, onChange,
}: {
  prefs: Prefs;
  onChange: (p: Prefs) => void;
}) {
  return (
    <div className="mb-6 rounded-xl border border-rule bg-panel p-5">
      <div className="eyebrow mb-1">Viewing</div>
      <p className="mb-3 text-[12px] text-ink-soft">
        Kept on this device — a preference for the tablet in the shed need not
        follow you to the laptop.
      </p>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={prefs.bees}
          onChange={(e) => onChange({ ...prefs, bees: e.target.checked })}
          className="h-5 w-5 accent-[color:var(--color-honey)]"
        />
        <span className="text-[13.5px]">
          🐝 Foraging bees
          <span className="block text-[12px] leading-snug text-ink-soft">
            They read the day's high against the 55&nbsp;°F flight threshold —
            more of them the warmer it is, none during a frost watch. Turn them
            off if you would rather nothing moved.
          </span>
        </span>
      </label>
    </div>
  );
}
