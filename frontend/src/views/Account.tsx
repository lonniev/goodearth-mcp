// Account — who you are, what you hold, and how the app behaves for you.
// Its own chunk, since the wallet and profile panels are needed only here.

import { AccountPage, NostrProfilePanel, WalletFunds, WalletStatement } from "@tollbooth-dpyc/web/react";
import { getStoredNpub } from "@tollbooth-dpyc/web";
import { decorateTile } from "../lib/tiles";
import { USAGE, USAGE_FIGURES, UsageRow } from "../components/usageDress";
import Preferences from "../components/Preferences";
import CalendarFeed from "../components/CalendarFeed";
import ForgetMe from "../components/ForgetMe";
import { latOf, type SavedRegion } from "../lib/regions";
import type { Prefs } from "../lib/prefs";
import { tour } from "../lib/tour/targets";

export default function Account({ spent, prefs, onPrefs, region, onForgotten, onSignOut }: {
  spent: number;
  prefs: Prefs;
  onPrefs: (next: Prefs) => void;
  region: SavedRegion;
  onForgotten: () => void;
  onSignOut: () => void;
}) {
  // Two columns on a landscape screen: who you are on the left, how
  // the app behaves for you on the right. The page is one flat list,
  // so the columns are CSS columns with the settings forced to the
  // second; one column on a phone, in the same order.
  return (
    <AccountPage
      npub={getStoredNpub()}
      heading="Account"
      before={
        <div className="grid gap-3" {...tour("account.summary")}>
          {spent > 0 && (
            <span className="data justify-self-start rounded-full bg-band px-2.5 py-1 text-[0.65625rem] text-ink-soft">
              {spent.toLocaleString()} drawn today
            </span>
          )}
          <WalletFunds decorateTile={decorateTile} />
        </div>
      }
      profile={false}
      between={{ usage: <WalletStatement /> }}
      usage={{ figures: USAGE_FIGURES, classNames: USAGE, renderRow: (t) => <UsageRow tool={t} /> }}
      // The time zone sits in Viewing with the season and degrees; the
      // season is Good Earth's theme; the build panel is on About.
      timezone={false}
      theme={false}
      build={false}
      after={
        <div className="grid gap-3 lg:break-before-column">
          <NostrProfilePanel npub={getStoredNpub()} />
          <Preferences prefs={prefs} lat={latOf(region.region)} onChange={onPrefs} />
          {/* Publishing is a once-per-region setup step, so it sits with
              the other settings rather than at the top of the working page. */}
          <CalendarFeed region={region} />
          {/* Last, because it is the one control here that cannot be
              taken back. */}
          <ForgetMe onForgotten={onForgotten} />
        </div>
      }
      onSignOut={onSignOut}
      signOutLabel="Sign out"
      classNames={{
        root: "gap-3 lg:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid",
        heading: "figure mb-3 text-[1.625rem] font-bold [column-span:all]",
        actions: "flex justify-end",
        signOut: "min-h-11 rounded-full border border-rule px-3.5 text-[0.75rem] text-ink-soft active:bg-band",
      }}
    />
  );
}
