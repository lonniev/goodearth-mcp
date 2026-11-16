// About — what this is, what it costs, and what is actually running.
//
// The version block is read live from the service rather than baked in at
// build time, because a frontend that reports the backend's version from a
// constant will eventually report it wrong, and a stale version string is the
// kind of small lie that makes people distrust the rest of a status page.

import { useEffect, useState } from "react";
import { formatDateTime, serviceStatus, type ServiceStatus } from "@tollbooth-dpyc/web";
import { BuildInfoPanel, Tx, useTimezone, type BuildInfoPanelClassNames } from "@tollbooth-dpyc/web/react";
import { useT, WORDS } from "../i18n";

// The build panel in the page's own dress: a ruled card, soft labels, the
// values in the data face. The package draws the rows; the look is ours.
const BUILD: BuildInfoPanelClassNames = {
  root: "rounded-md border border-rule bg-panel px-4 py-2 text-[0.8125rem]",
  section: "eyebrow mt-3 mb-0.5 first:mt-1",
  row: "grid grid-cols-[7rem_1fr] gap-x-3 border-b border-rule py-2 last:border-b-0 sm:grid-cols-[11rem_1fr]",
  label: "text-ink-soft",
  value: "data min-w-0 [overflow-wrap:anywhere]",
  link: "underline decoration-rule underline-offset-2",
};

export default function About() {
  const t = useT();
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
        <h1 className="figure text-[1.625rem] font-bold">{t("views.about.title")}</h1>
        <span className="text-[0.8125rem] text-ink-soft">{t("views.about.subtitle")}</span>
      </div>

      {/* ── What it is ─────────────────────────────────────────────────── */}
      <div className="mb-5 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3.5">
        {/* The same correction as the welcome page: name the thing this is
            better THAN, rather than denying a claim nobody made. */}
        <p className="text-[0.875rem] leading-relaxed">
          <Tx ns={WORDS} k="views.about.what" components={{ b: <b className="figure text-[1rem]" /> }} />
        </p>
        {/* "That spread is the whole product" claimed the service amounts to
            noticing that microclimates exist — which every grower who has
            walked a field in April already knows, and which would make this a
            poor thing to pay for. The spread is a PROPERTY of the answers. The
            answers are the product. */}
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
          {t("views.about.arithmetic")}
        </p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
          {t("views.about.alreadyKnows")}
        </p>
      </div>

      {/* ── What it costs ──────────────────────────────────────────────── */}
      <h2 className="figure mb-2.5 text-[1.125rem] font-semibold">⚡ {t("views.about.payingHeading")}</h2>
      <div className="rounded-md border border-rule bg-panel px-4 py-3.5 text-[0.8125rem] leading-relaxed">
        <p>{t("views.about.paying1")}</p>
        <p className="mt-2">
          <Tx ns={WORDS} k="views.about.paying2" components={{ b: <b />, i: <i /> }} />
        </p>
        <p className="mt-2">{t("views.about.paying3")}</p>
      </div>

      {/* ── For an AI assistant ────────────────────────────────────────── */}
      {/* An assistant asked about Good Earth could not find how to use it,
          and said so: the page was built for a person, and the address its
          own tools answer on was written nowhere a reader would look. */}
      <h2 className="figure mt-7 mb-2.5 text-[1.125rem] font-semibold">🤖 {t("views.about.aiHeading")}</h2>
      <div className="rounded-md border border-rule bg-panel px-4 py-3.5 text-[0.8125rem] leading-relaxed">
        <p>{t("views.about.ai1")}</p>
        <p className="data mt-2 break-all rounded bg-band px-2.5 py-1.5 text-[0.78125rem]">
          https://goodearth-mcp.fastmcp.app/mcp
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><Tx ns={WORDS} k="views.about.aiClaude" components={{ b: <b /> }} /></li>
          <li><Tx ns={WORDS} k="views.about.aiClaudeCode" components={{ b: <b />, cmd: <span className="data" /> }} /></li>
          <li><Tx ns={WORDS} k="views.about.aiCursor" components={{ b: <b />, data: <span className="data" /> }} /></li>
        </ul>
        <p className="mt-2 text-ink-soft">
          <Tx ns={WORDS} k="views.about.aiConfirm" components={{ summary: <a href="/llms.txt" className="underline" /> }} />
        </p>
      </div>

      {/* ── What is running ────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[1.125rem] font-semibold">🔧 {t("views.about.runningHeading")}</h2>
      {err ? (
        <div className="rounded-md border border-clay/30 bg-clay/10 p-3 text-[0.8125rem] text-clay">
          {t("views.about.unreachable", { err })}
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
            <span className={BUILD.label}>{t("views.about.fingerprint")}</span>{" "}
            <span className={BUILD.value}>
              {status?.operator_npub_hash ?? "—"}
              <span className="mt-0.5 block text-[0.71875rem] text-ink-soft">
                {t("views.about.fingerprintHint")}
              </span>
            </span>
          </div>
          <div className={BUILD.row}>
            <span className={BUILD.label}>{t("views.about.persistence")}</span>{" "}
            <span className={BUILD.value}>
              {status ? (status.vault_configured ? t("views.about.configured") : t("views.about.notConfigured")) : "—"}
            </span>
          </div>
        </BuildInfoPanel>
      )}

      {/* ── The network ────────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[1.125rem] font-semibold">🌐 {t("views.about.networkHeading")}</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {[
          { name: "Good Brew", url: "https://cafe.tollbooth-dpyc.com",
            line: t("views.about.goodBrew") },
          { name: "Tollbooth DPYC", url: "https://github.com/lonniev/tollbooth-dpyc",
            line: t("views.about.tollbooth") },
          { name: t("views.about.sourceName"), url: "https://github.com/lonniev/goodearth-mcp",
            line: t("views.about.source") },
          { name: "Pricing Studio", url: "https://github.com/lonniev/tollbooth-pricing-studio",
            line: t("views.about.pricingStudio") },
        ].map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
            className="rounded-md border border-rule bg-panel px-3.5 py-3 active:border-ink">
            <div className="figure text-[0.90625rem] font-semibold">🔗 {l.name}</div>
            <p className="mt-0.5 text-[0.78125rem] leading-snug text-ink-soft">{l.line}</p>
          </a>
        ))}
      </div>

      <p className="mt-6 text-[0.75rem] leading-relaxed text-ink-soft">
        {t("views.about.openSource")}
      </p>
    </>
  );
}
