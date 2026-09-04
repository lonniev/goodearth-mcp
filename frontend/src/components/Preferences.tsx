// Viewing preferences, on the Account page beside the Nostr profile.

import type { Prefs } from "../lib/prefs";
import { showTemp, type Unit } from "../lib/units";

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

      {/* Fahrenheit is what the record is kept in, and switching this does
          not rewrite it — a threshold entered as 50 °F is still 50 °F, shown
          as 10 °C. */}
      <div className="mb-4">
        <div className="mb-1.5 text-[13.5px]">🌡️ Degrees</div>
        <div className="flex gap-1.5">
          {(["F", "C"] as Unit[]).map((u) => (
            <button
              key={u}
              onClick={() => onChange({ ...prefs, units: u })}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-[12.5px] font-medium ${
                prefs.units === u
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-ink-soft active:bg-band"
              }`}
            >
              °{u}
            </button>
          ))}
        </div>
      </div>

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
            They read the day&rsquo;s high against the{" "}
            {showTemp(55, prefs.units)} flight threshold — more of them the
            warmer it is, none during a frost watch. Turn them off if you would
            rather nothing moved.
          </span>
        </span>
      </label>
    </div>
  );
}
