// The chrome a visitor gets, which is deliberately not the grower's.
//
// `AppShell` cannot serve this: `region`, `npub`, `avatar` and `displayName`
// are all required and it renders the region picker unconditionally — which is
// the right shape for a working farm and exactly the wrong one for a stranger,
// since every one of those names a patron. So this is a second, much smaller
// shell rather than a pile of optional props threaded through the first.
//
// It carries the wordmark, a flat row of the public pages, and one way in.
// No rail, no block, no conditions, no hive — nothing here knows a grower
// exists.

import type { ReactNode } from "react";
import { PUBLIC_VIEWS, type ViewKey } from "../lib/views";
import { ShareButton } from "./Share";

const LABEL: Record<string, string> = {
  welcome: "Welcome",
  plant: "Plants",
  pest: "Insects",
  tree: "Trees",
  // "Animals" rather than "Wildlife": the signed-in rail already has a
  // Wildlife page and the two are not the same thing.
  animal: "Animals",
  glossary: "Words",
  about: "About",
  references: "Sources",
};

export default function GuestShell({ view, onView, onSignIn, children }: {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  onSignIn: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-rule bg-panel">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6">
          <button onClick={() => onView("welcome")}
            className="figure shrink-0 text-[18px] font-bold">
            Good<span className="ml-1 text-honey italic">Earth</span>
          </button>

          {/* On a phone the pages take a row of their own under the wordmark
              and the buttons: squeezed beside them they fell one per line. */}
          <nav className="order-last flex w-full flex-wrap items-center gap-x-1 gap-y-1 md:order-none md:w-auto md:flex-1">
            {/* The page guides are public but not a row of eight more
                buttons here: Welcome indexes them, and a guest reading one
                has that door back. */}
            {PUBLIC_VIEWS.filter((k) => k in LABEL).map((k) => (
              <button key={k} onClick={() => onView(k)}
                aria-current={view === k ? "page" : undefined}
                className={`min-h-9 rounded-full px-3 text-[12.5px] font-medium ${
                  view === k ? "bg-ink text-paper" : "text-ink-soft active:bg-band"
                }`}>
                {LABEL[k]}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* The words and the sources leave the app the same way they do
                for a grower: nothing here needs an npub. */}
            <ShareButton />
            <button onClick={onSignIn}
              className="min-h-9 shrink-0 rounded-full border-[1.5px] border-ink px-4 text-[12.5px] font-semibold">
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* The device's full width, with side padding. These were capped at
          1024 px, so a visitor on a wider screen read everything in a column
          with empty margins either side. */}
      <main className="px-4 py-6 md:px-6">{children}</main>

      <footer className="px-4 pt-2 pb-8 text-[12px] text-ink-soft md:px-6">
        Good Earth is an operator on the DPYC network. Identity is a Nostr
        keypair; answers are paid for in Bitcoin Lightning, per call.
      </footer>
    </div>
  );
}
