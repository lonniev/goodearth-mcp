// About — what this is, what it costs, and what is actually running.
//
// The version block is read live from the service rather than baked in at
// build time, because a frontend that reports the backend's version from a
// constant will eventually report it wrong, and a stale version string is the
// kind of small lie that makes people distrust the rest of a status page.

import { useEffect, useState } from "react";
import { serviceStatus, type ServiceStatus } from "../lib/mcp";

export default function About() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    serviceStatus()
      .then(setStatus)
      .catch((e) => setErr((e as Error).message));
  }, []);

  const build = (status as unknown as { build_info?: Record<string, string> } | null)?.build_info;

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">About</h1>
        <span className="text-[13px] text-ink-soft">Good Earth, and the tollbooth behind it</span>
      </div>

      {/* ── What it is ─────────────────────────────────────────────────── */}
      <div className="mb-5 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3.5">
        <p className="text-[14px] leading-relaxed">
          <b className="figure text-[16px]">A farm is not a point.</b> A bench
          and a hollow on the same acreage do not share a frost date, and every
          free weather calculator answers for a pin. Good Earth answers for{" "}
          <i>ground</i> — draw the block, and every answer comes back with the
          spread across it.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          That spread is the whole product. It is what tells you whether one
          planting date serves the whole field, which bed takes the frost first,
          and how many days apart the two ends of a block really are.
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
        <p className="mt-2 text-ink-soft">
          Your regions, crops, pests, wildlife and field reports stay on your
          device, and are yours to carry to another. They are not the operator's
          asset and are not the product.
        </p>
      </div>

      {/* ── What is running ────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">🔧 What is running</h2>
      {err ? (
        <div className="rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">
          Could not reach the service: {err}
        </div>
      ) : !status ? (
        <div className="rounded-md border border-rule bg-panel p-4 text-[13px] text-ink-soft">
          Asking the service…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-rule bg-panel">
          <table className="w-full text-[13px]">
            <tbody>
              <Row k="Service" v={status.service ?? "goodearth-mcp"} />
              <Row k="Version" v={status.version ?? "—"} />
              <Row k="Tollbooth DPYC SDK" v={status.tollbooth_dpyc_version ?? "—"} />
              <Row k="Frontend" v={`${__APP_VERSION__} · ${__BUILD_COMMIT__}`} />
              <Row k="Built" v={new Date(__BUILD_TIME__).toLocaleString()} />
              {build?.fastmcp_cloud_git_commit_sha && (
                <Row k="Deployed commit" v={build.fastmcp_cloud_git_commit_sha.slice(0, 12)} />
              )}
              <Row k="Operator fingerprint"
                v={(status as unknown as { operator_npub_hash?: string }).operator_npub_hash ?? "—"}
                note="Verify this matches the fingerprint on any direct message claiming to be Good Earth." />
              <Row k="Persistence"
                v={(status as unknown as { vault_configured?: boolean }).vault_configured ? "configured" : "not configured"} />
            </tbody>
          </table>
        </div>
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

      <p className="mt-6 max-w-prose text-[12px] leading-relaxed text-ink-soft">
        Good Earth is open source under Apache-2.0. If an answer here disagrees
        with your own record, the References page shows exactly which feed and
        which assumption produced it — and a field report turns that
        disagreement into a correction for your block.
      </p>
    </>
  );
}

function Row({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <tr className="border-b border-rule last:border-b-0">
      <td className="px-4 py-2.5 align-top text-ink-soft">{k}</td>
      <td className="px-4 py-2.5">
        <span className="data">{v}</span>
        {note && <p className="mt-0.5 text-[11.5px] text-ink-soft">{note}</p>}
      </td>
    </tr>
  );
}
