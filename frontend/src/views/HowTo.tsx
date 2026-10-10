// How a page is used — the (?) in the top bar opens one of these.
//
// Three parts, always in this order. First the phenomenon: what is happening
// on the ground the page describes, because a control is meaningless until
// the reader knows what the number under it is. Then the page's controls,
// grouped by what they do to the record — add, read, change, remove — so a
// grower who wants to delete something can skip to the verb. Last, the same
// work from an agent: the web app is one client of the MCP server, and a
// grower with Claude.ai connected can do everything here by asking for it.
//
// The content lives beside this file in `howto/`, one module per page, as
// data in the `Guide` shape. This file knows how to draw a guide and nothing
// about any particular one.

import { Claim, Facts } from "../components/Diagram";
import { TourButton } from "../components/Tour";
import { ICON, IconButton } from "../components/ui";
import { GUIDE_META, type GuidedView } from "../lib/guides";
import type { ViewKey } from "../lib/views";
import type { Guide } from "./howto/types";
import { almanac } from "./howto/almanac";
import { crops } from "./howto/crops";
import { ledger } from "./howto/ledger";
import { pests } from "./howto/pests";
import { plots } from "./howto/plots";
import { reports } from "./howto/reports";
import { todo } from "./howto/todo";
import { wildlife } from "./howto/wildlife";

const GUIDES: Record<GuidedView, Guide> = {
  plots, ledger, almanac, crops, pests, wildlife, todo, reports,
};

export default function HowTo({ page, onView }: {
  page: GuidedView;
  onView: (v: ViewKey) => void;
}) {
  const meta = GUIDE_META[page];
  const g = GUIDES[page];
  return (
    <article>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="figure mb-1 text-[24px] font-bold">
            <span className="mr-1.5" aria-hidden="true">{meta.emoji}</span>
            How {meta.title} works
          </h1>
          <p className="eyebrow">{meta.eyebrow}</p>
        </div>
        <div className="flex gap-1.5">
          <IconButton path={ICON.frame} label={`Open ${meta.title}`} tone="quiet"
            title={`Go to ${meta.title}`} onClick={() => onView(page)} />
          {/* The same page, with its tour running: the guide in motion. */}
          <TourButton page={page} onView={onView} />
          <IconButton path={ICON.ask} label="Guides" tone="quiet"
            title="All the guides" onClick={() => onView("welcome")} />
        </div>
      </div>

      <Claim>{g.claim}</Claim>
      <div className="space-y-3 text-[13.5px] leading-relaxed">{g.phenomenon}</div>
      {g.facts && <Facts items={g.facts} />}

      {/* ── Using the page ───────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-1 text-[18px] font-semibold">
        <span className="mr-0.5">🧭</span>Using the page
      </h2>
      <p className="mb-3 text-[12.5px] text-ink-soft">
        The control on the left, what it does on the right. Everything saved
        goes to your record under your npub, so the phone and the laptop show
        the same ground.
      </p>
      {g.using.map((u) => (
        <section key={u.heading} className="mb-4">
          <h3 className="figure mb-1.5 text-[15px] font-semibold">
            <span className="mr-1" aria-hidden="true">{u.emoji}</span>{u.heading}
          </h3>
          <dl className="divide-y divide-rule rounded-md border border-rule bg-panel">
            {u.steps.map(([control, does], i) => (
              <div key={i} className="grid gap-x-4 gap-y-1 px-3.5 py-2.5 sm:grid-cols-[11rem_1fr]">
                <dt className="text-[13px] font-semibold">{control}</dt>
                <dd className="text-[13px] leading-relaxed text-ink">{does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {/* ── From an agent ────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-1 text-[18px] font-semibold">
        <span className="mr-0.5">🤖</span>From an agent
      </h2>
      <p className="mb-3 text-[13.5px] leading-relaxed">{g.agent.lead}</p>
      <div className="rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
        <p className="eyebrow">You say</p>
        <p className="mt-1 text-[13.5px] italic leading-relaxed">“{g.agent.say}”</p>
        <p className="eyebrow mt-3">The agent</p>
        <p className="mt-1 text-[13.5px] leading-relaxed">{g.agent.does}</p>
        <p className="mt-2.5 flex flex-wrap gap-1.5">
          {g.agent.tools.map((t) => (
            <code key={t} className="data rounded-full border border-rule bg-paper px-2 py-0.5 text-[10.5px]">
              {t}
            </code>
          ))}
        </p>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
        The share button beside the (?) in the top bar shows this page's
        table — braces copy it as JSON for an agent, the two pages copy it as
        text for a note or a mail.
      </p>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
        Connecting is on the About page: the MCP endpoint goes into Claude.ai
        or Claude Desktop under Connectors, and the first call asks for your
        npub and a Nostr reply to prove it. The same record answers either way
        — a planting saved by an agent is on Flora the next time you look.
      </p>
    </article>
  );
}
