// Viewing preferences, on the Account page beside the Nostr profile.

import { TimezonePicker } from "@tollbooth-dpyc/web/react";
import { useT } from "../i18n";
import type { Prefs, ThemeChoice } from "../lib/prefs";
import { SEASONS, seasonOf } from "../lib/season";
import { useTour, useTourSwitch } from "@tollbooth-dpyc/web/react";
import { tour } from "../lib/tour/targets";
import { showTemp, type Unit } from "../lib/units";

export default function Preferences({
  prefs, lat, onChange,
}: {
  prefs: Prefs;
  /// Where the plot being worked lies: "Follow" names its season.
  lat: number;
  onChange: (p: Prefs) => void;
}) {
  // The account page's own tour: the package's panels, then these switches.
  useTour("account");
  const tutorial = useTourSwitch();
  const t = useT();
  return (
    <div className="rounded-xl border border-rule bg-panel px-4 py-3">
      <div className="eyebrow mb-2">{t("ui.preferences.viewing")}</div>
      <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2">

      {/* The seasons shift hue and never polarity — this is a change of light,
          not a dark mode. "Follow the season" is the default because a farm
          calendar that did not would be a strange thing. */}
      <div {...tour("account.season")}>
        <div className="mb-1 text-[0.84375rem]">{t("ui.preferences.season")}</div>
        <div className="flex flex-wrap gap-1.5">
          {(["follow", ...SEASONS] as ThemeChoice[]).map((s) => (
            <button
              key={s}
              onClick={() => onChange({ ...prefs, theme: s })}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-[0.78125rem] font-medium capitalize ${
                prefs.theme === s
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-ink-soft active:bg-band"
              }`}
            >
              {s === "follow"
                ? t("ui.preferences.follow", { season: t(`ui.preferences.${seasonOf(new Date(), lat)}` as const) })
                : t(`ui.preferences.${s}` as const)}
            </button>
          ))}
        </div>
      </div>

      {/* Fahrenheit is what the record is kept in, and switching this does
          not rewrite it — a threshold entered as 50 °F is still 50 °F, shown
          as 10 °C. */}
      <div {...tour("account.degrees")}>
        <div className="mb-1 text-[0.84375rem]">{t("ui.preferences.degrees")}</div>
        <div className="flex gap-1.5">
          {(["F", "C"] as Unit[]).map((u) => (
            <button
              key={u}
              onClick={() => onChange({ ...prefs, units: u })}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-[0.78125rem] font-medium ${
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

      {/* The viewer's clock: when an answer was read, a change queued, a radar
          frame taken. A frost night or a planting date is the farm's calendar
          and stays where the farm is. */}
      <TimezonePicker
        label={t("ui.preferences.timeZone")}
        classNames={{
          label: "mb-1 block text-[0.84375rem]",
          select: "min-h-11 max-w-full rounded-full border border-rule bg-panel px-4 text-[0.78125rem] font-medium text-ink",
        }}
      />
      </div>

      {/* The guided tour. On, every page shows its own once; off, nothing
          pops up anywhere. Turning it on again replays them all. */}
      <label className="flex min-h-11 items-center gap-3" {...tour("account.tutorial")}>
        <input
          type="checkbox"
          checked={tutorial.on}
          onChange={(e) => tutorial.setOn(e.target.checked)}
          className="h-5 w-5 accent-[color:var(--color-honey)]"
        />
        <span className="text-[0.84375rem]">
          {t("ui.preferences.tutorial")}
          <span className="block text-[0.75rem] leading-snug text-ink-soft">
            {t("ui.preferences.tutorialNote")}
          </span>
        </span>
      </label>

      <label className="flex min-h-11 items-center gap-3" {...tour("account.bees")}>
        <input
          type="checkbox"
          checked={prefs.bees}
          onChange={(e) => onChange({ ...prefs, bees: e.target.checked })}
          className="h-5 w-5 accent-[color:var(--color-honey)]"
        />
        <span className="text-[0.84375rem]">
          {t("ui.preferences.bees")}
          <span className="block text-[0.75rem] leading-snug text-ink-soft">
            {t("ui.preferences.beesNote", { temp: showTemp(55, prefs.units) })}
          </span>
        </span>
      </label>
    </div>
  );
}
