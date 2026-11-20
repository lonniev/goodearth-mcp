// Account — who you are, what you hold, and how the app behaves for you.
// Its own chunk, since the wallet and profile panels are needed only here.

import { AccountPage, LanguageChooser, NostrProfilePanel, WalletFunds, WalletStatement, useLanguageLocale } from "@tollbooth-dpyc/web/react";
import { getStoredNpub } from "@tollbooth-dpyc/web";
import { decorateTile } from "../lib/tiles";
import { USAGE, USAGE_FIGURES, UsageRow } from "../components/usageDress";
import Preferences from "../components/Preferences";
import CalendarFeed from "../components/CalendarFeed";
import ForgetMe from "../components/ForgetMe";
import { latOf, type SavedRegion } from "../lib/regions";
import type { Prefs } from "../lib/prefs";
import { tour } from "../lib/tour/targets";
import { useT } from "../i18n";

export default function Account({ spent, prefs, onPrefs, region, onForgotten, onSignOut }: {
  spent: number;
  prefs: Prefs;
  onPrefs: (next: Prefs) => void;
  region: SavedRegion;
  onForgotten: () => void;
  onSignOut: () => void;
}) {
  // The package's folding groups, each a grid of panels side by side where
  // they fit and one column on a phone: what you hold under Money, who you
  // are and how the app behaves for you under You, the calendar under This site.
  const t = useT();
  const locale = useLanguageLocale();
  return (
    <AccountPage
      npub={getStoredNpub()}
      heading={t("views.account.heading")}
      profile={false}
      usage={{ figures: USAGE_FIGURES, classNames: USAGE, renderRow: (t) => <UsageRow tool={t} /> }}
      // The time zone sits in Viewing with the season and degrees; the
      // season is Good Earth's theme; the build panel is on About.
      timezone={false}
      theme={false}
      build={false}
      panels={{
        money: (
          <>
            <div className="grid gap-3" {...tour("account.summary")}>
              {spent > 0 && (
                <span className="data justify-self-start rounded-full bg-band px-2.5 py-1 text-[0.65625rem] text-ink-soft">
                  {t("views.account.drawnToday", { n: spent.toLocaleString(locale) })}
                </span>
              )}
              <WalletFunds decorateTile={decorateTile} />
            </div>
            <WalletStatement />
          </>
        ),
        you: (
          <>
            <NostrProfilePanel npub={getStoredNpub()} />
            <Preferences prefs={prefs} lat={latOf(region.region)} onChange={onPrefs} />
            <div className="rounded-xl border border-rule bg-panel px-4 py-3">
              <div className="eyebrow mb-2">{t("views.account.language")}</div>
              <LanguageChooser />
            </div>
            {/* Last, because it is the one control here that cannot be
                taken back. */}
            <ForgetMe onForgotten={onForgotten} />
          </>
        ),
        // Publishing is a once-per-region setup step, so it sits apart
        // from the working page.
        site: <CalendarFeed region={region} />,
      }}
      onSignOut={onSignOut}
      signOutLabel={t("views.account.signOut")}
      classNames={{
        root: "grid gap-5",
        heading: "figure text-[1.625rem] font-bold",
        groupSummary: "figure cursor-pointer py-1 text-[1.25rem]",
        groupBody: "mt-3 grid items-start gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))]",
        actions: "col-span-full flex justify-end",
        signOut: "min-h-11 rounded-full border border-rule px-3.5 text-[0.75rem] text-ink-soft active:bg-band",
      }}
    />
  );
}
