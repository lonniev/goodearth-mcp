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

const LABEL: Record<string, string> = {
  welcome: "Welcome",
  plant: "Plants",
  pest: "Insects",
  tree: "Trees",
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <button onClick={() => onView("welcome")}
            className="figure shrink-0 text-[18px] font-bold">
            Good<span className="ml-1 text-honey italic">Earth</span>
          </button>

          <nav className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1">
            {PUBLIC_VIEWS.map((k) => (
              <button key={k} onClick={() => onView(k)}
                aria-current={view === k ? "page" : undefined}
                className={`min-h-9 rounded-full px-3 text-[12.5px] font-medium ${
                  view === k ? "bg-ink text-paper" : "text-ink-soft active:bg-band"
                }`}>
                {LABEL[k] ?? k}
              </button>
            ))}
          </nav>

          <button onClick={onSignIn}
            className="min-h-9 shrink-0 rounded-full border-[1.5px] border-ink px-4 text-[12.5px] font-semibold">
            Sign in
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 pt-2 pb-8 text-[12px] text-ink-soft">
        Good Earth is an operator on the DPYC network. Identity is a Nostr
        keypair; answers are paid for in Bitcoin Lightning, per call.
      </footer>
    </div>
  );
}
