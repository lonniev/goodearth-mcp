// About — what this is, what it costs, and what is actually running.
//
// The version block is read live from the service rather than baked in at
// build time, because a frontend that reports the backend's version from a
// constant will eventually report it wrong, and a stale version string is the
// kind of small lie that makes people distrust the rest of a status page.

import { useEffect, useState } from "react";
import { formatDateTime, serviceStatus, type ServiceStatus } from "@tollbooth-dpyc/web";
import { BuildInfoPanel, useTimezone, type BuildInfoPanelClassNames } from "@tollbooth-dpyc/web/react";

// The build panel in the page's own dress: a ruled card, soft labels, the
// values in the data face. The package draws the rows; the look is ours.
const BUILD: BuildInfoPanelClassNames = {
  root: "rounded-md border border-rule bg-panel px-4 py-2 text-[13px]",
  section: "eyebrow mt-3 mb-0.5 first:mt-1",
  row: "grid grid-cols-[7rem_1fr] gap-x-3 border-b border-rule py-2 last:border-b-0 sm:grid-cols-[11rem_1fr]",
  label: "text-ink-soft",
  value: "data min-w-0 [overflow-wrap:anywhere]",
  link: "underline decoration-rule underline-offset-2",
};

export default function About() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [err, setErr] = useState("");
  const [, zone] = useTimezone();

  useEffect(() => {
    serviceStatus()
      .then(setStatus)
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">About</h1>
        <span className="text-[13px] text-ink-soft">Good Earth, and the tollbooth behind it</span>
      </div>

      {/* ── What it is ─────────────────────────────────────────────────── */}
      <div className="mb-5 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3.5">
        {/* The same correction as the welcome page: name the thing this is
            better THAN, rather than denying a claim nobody made. */}
        <p className="text-[14px] leading-relaxed">
          <b className="figure text-[16px]">
            Many weather services provide a climate prediction for a single
            weather station that may be miles from your fields.
          </b>{" "}
          Good Earth helps you estimate the climate variation across the varied
          surface of your plots and fields. A bench and a hollow on the same
          acreage do not share a frost date — draw the block, and every answer
          comes back with the spread across it.
        </p>
        {/* "That spread is the whole product" claimed the service amounts to
            noticing that microclimates exist — which every grower who has
            walked a field in April already knows, and which would make this a
            poor thing to pay for. The spread is a PROPERTY of the answers. The
            answers are the product. */}
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          The spread is a property of the answers rather than the service
          itself. What Good Earth does is the arithmetic a walk cannot: it reads
          public scientific feeds against the shape you drew and returns dates.
          When the frost window opens and closes here. Which sowing still
          finishes before it closes. Which week a pest&rsquo;s stages arrive.
          Whether a tree banks the chill it needs on this ground.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          A grower already knows the hollow is colder. What this adds is how
          many days colder, from which feed, with the assumption inside the
          model written down beside the number.
        </p>
      </div>

      {/* ── What it costs ──────────────────────────────────────────────── */}
      <h2 className="figure mb-2.5 text-[18px] font-semibold">⚡ How paying works</h2>
      <div className="rounded-md border border-rule bg-panel px-4 py-3.5 text-[13px] leading-relaxed">
        <p>
          Answers draw from a pre-funded balance of satoshis — Bitcoin's
          smallest unit — over the Lightning network. You top up when you
          choose to, and nothing interrupts you mid-task to ask for a card.
        </p>
        <p className="mt-2">
          That is the point of <b>DPYC</b>, which stands for{" "}
          <i>Don't Pester Your Customer</i>. There is no account and no
          password: your identity is a Nostr key you already own, the same one
          that signs your profile. The operator never holds your credentials and
          never sees a payment method.
        </p>
        <p className="mt-2">
          Every answer on this site shows what it cost, on the card that carries
          it. Prices are set live by the operator and can move — a free tier, a
          quiet-season discount, a surge — so the figure you see is read from
          the pricing model at the moment you ask, never from anything baked
          into this page.
        </p>
      </div>

      {/* ── For an AI assistant ────────────────────────────────────────── */}
      {/* An assistant asked about Good Earth could not find how to use it,
          and said so: the page was built for a person, and the address its
          own tools answer on was written nowhere a reader would look. */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">🤖 Use it from your AI assistant</h2>
      <div className="rounded-md border border-rule bg-panel px-4 py-3.5 text-[13px] leading-relaxed">
        <p>
          Everything on this site is also an MCP server, so an assistant such as
          Claude or Cursor can ask Good Earth the same questions for you — same
          answers, same balance, same Nostr key.
        </p>
        <p className="data mt-2 break-all rounded bg-band px-2.5 py-1.5 text-[12.5px]">
          https://goodearth-mcp.fastmcp.app/mcp
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Claude.ai or Claude Desktop:</b> Customize → Connectors → Add custom connector, and paste the address.</li>
          <li><b>Claude Code:</b> <span className="data">claude mcp add --transport http goodearth</span> and the address.</li>
          <li><b>Cursor:</b> add it under <span className="data">mcpServers</span> as a <span className="data">url</span>.</li>
        </ul>
        <p className="mt-2 text-ink-soft">
          The assistant asks for your npub and sends you a direct message to
          confirm it is you — reply from your Nostr client, as you do to sign in
          here. <a href="/llms.txt" className="underline">A plain-text summary for assistants</a> says the rest.
        </p>
      </div>

      {/* ── What is running ────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">🔧 What is running</h2>
      {err ? (
        <div className="rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">
          Could not reach the service: {err}
        </div>
      ) : (
        <BuildInfoPanel
          status={status}
          heading={null}
          frontend={{
            version: __APP_VERSION__,
            commit: __BUILD_COMMIT__,
            builtAt: formatDateTime(__BUILD_TIME__, zone),
            source: "https://github.com/lonniev/goodearth-mcp",
          }}
          classNames={BUILD}
        >
          <div className={BUILD.row}>
            <span className={BUILD.label}>Operator fingerprint</span>{" "}
            <span className={BUILD.value}>
              {status?.operator_npub_hash ?? "—"}
              <span className="mt-0.5 block text-[11.5px] text-ink-soft">
                Verify this matches the fingerprint on any direct message claiming to be Good Earth.
              </span>
            </span>
          </div>
          <div className={BUILD.row}>
            <span className={BUILD.label}>Persistence</span>{" "}
            <span className={BUILD.value}>
              {status ? (status.vault_configured ? "configured" : "not configured") : "—"}
            </span>
          </div>
        </BuildInfoPanel>
      )}

      {/* ── The network ────────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">🌐 The wider network</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {[
          { name: "Good Brew", url: "https://cafe.tollbooth-dpyc.com",
            line: "The sibling storefront — coffee, books, and the DPYC tech site." },
          { name: "Tollbooth DPYC", url: "https://github.com/lonniev/tollbooth-dpyc",
            line: "The shared runtime: ledger, encrypted vault, pricing, Lightning, audit." },
          { name: "Good Earth source", url: "https://github.com/lonniev/goodearth-mcp",
            line: "Apache-2.0. The models on the References page are all readable here." },
          { name: "Pricing Studio", url: "https://github.com/lonniev/tollbooth-pricing-studio",
            line: "The operator console where these prices are actually set." },
        ].map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
            className="rounded-md border border-rule bg-panel px-3.5 py-3 active:border-ink">
            <div className="figure text-[14.5px] font-semibold">🔗 {l.name}</div>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{l.line}</p>
          </a>
        ))}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-soft">
        Good Earth is open source under Apache-2.0. If an answer here disagrees
        with your own record, the References page shows exactly which feed and
        which assumption produced it — and a field report turns that
        disagreement into a correction for your block.
      </p>
    </>
  );
}
