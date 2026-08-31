// Field Reports — what you saw, and what the block learned from it.
//
// Capture is designed for someone standing in a field holding a tablet in one
// hand: a tag is one tap, the date defaults to today, and location is offered
// rather than demanded. Nothing else is required to file a report.
//
// The panel above the form is the point of the whole feature. Each report
// measures the gap between what the model predicted and what the ground did,
// and enough of them turn a 9 km grid into this block's own calendar. That is
// the one thing here that gets better the longer a farm uses it.

import { useCallback, useEffect, useState } from "react";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import { calibration, type CalibrationResult } from "../lib/mcp";
import { boundsFrom, fetchObservations, type INatObservation } from "../lib/inaturalist";
import { geoJSONToRing } from "../lib/geo";
import {
  deleteReport, listReports, makeReport, saveReport, TAGS,
  toObservations, type FieldReport, type ReportTag,
} from "../lib/reports";
import type { SavedRegion } from "../lib/regions";

const today = () => new Date().toISOString().slice(0, 10);
const nice = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const CONFIDENCE: Record<string, string> = {
  provisional: "bg-band text-ink-soft",
  early: "bg-band text-ink-soft",
  firming: "bg-honey/15 text-honey",
  settled: "bg-growth/15 text-growth",
};

export default function FieldReports({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  const [reports, setReports] = useState<FieldReport[]>(() => listReports(region.id));
  const [tag, setTag] = useState<ReportTag>("frost");
  const [cal, setCal] = useState<CalibrationResult | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [inatUser, setInatUser] = useState(() => {
    try { return window.localStorage.getItem("goodearth:inat-user") ?? ""; } catch { return ""; }
  });
  const [inat, setInat] = useState<INatObservation[] | null>(null);
  const [inatBusy, setInatBusy] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  useEffect(() => { setReports(listReports(region.id)); }, [region.id]);

  const run = useCallback(async (list: FieldReport[]) => {
    const obs = toObservations(list);
    if (!obs.length) { setCal(null); return; }
    setBusy(true); setErr("");
    try {
      const r = await calibration(region.region, obs, region.baseTempF);
      if (!r.success) { setErr(r.error || "Calibration could not be read."); return; }
      setCal(r); setRanAt(new Date());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(reports); }, [run, reports]);

  function pin() {
    if (!navigator.geolocation) { setMsg("This device will not share a location."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setMsg("Pinned where you are."); },
      () => setMsg("Could not get a location — the report files fine without one."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function file(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const made = makeReport({
      regionId: region.id,
      tag,
      observedOn: String(f.get("on") || today()),
      note: String(f.get("note") || "").trim(),
      ...(here ?? {}),
      ...(tag === "first_bloom" || tag === "emergence" || tag === "pest"
        ? {
            crop: String(f.get("crop") || "").trim(),
            stage: String(f.get("stage") || "").trim() || undefined,
            gddTarget: f.get("target") ? Number(f.get("target")) : undefined,
            setOut: String(f.get("setout") || "") || undefined,
          }
        : {}),
    });
    if (typeof made === "string") { setErr(made); return; }
    setErr(""); setMsg("Filed.");
    setReports(saveReport(made).filter((r) => r.regionId === region.id));
    e.currentTarget.reset();
    setHere(null);
  }

  // The block's own bounding box, so an import brings back the farm rather
  // than the grower's holiday photographs.
  function regionBounds() {
    if ("lat" in region.region) {
      const d = region.region.radius_m / 111_320;
      return {
        swlat: region.region.lat - d, swlng: region.region.lon - d * 1.4,
        nelat: region.region.lat + d, nelng: region.region.lon + d * 1.4,
      };
    }
    const ring = geoJSONToRing(region.region);
    if (!ring.length) return undefined;
    return boundsFrom({
      min_lat: Math.min(...ring.map((p) => p.lat)),
      min_lon: Math.min(...ring.map((p) => p.lng)),
      max_lat: Math.max(...ring.map((p) => p.lat)),
      max_lon: Math.max(...ring.map((p) => p.lng)),
    });
  }

  async function pullINat() {
    setInatBusy(true); setErr(""); setMsg("");
    try {
      try { window.localStorage.setItem("goodearth:inat-user", inatUser.trim()); } catch { /* noop */ }
      const rows = await fetchObservations({
        user: inatUser,
        bounds: regionBounds(),
        since: `${new Date().getFullYear() - 1}-01-01`,
        perPage: 60,
      });
      setInat(rows);
      setPicked(new Set(rows.filter((r) => r.flowering).map((r) => r.id)));
      if (!rows.length) {
        setMsg(`No observations from ${inatUser} inside ${region.name}. The box is your ground — a wider search would bring back the whole world.`);
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setInatBusy(false); }
  }

  function importPicked() {
    if (!inat) return;
    let added = 0;
    for (const o of inat) {
      if (!picked.has(o.id) || !o.observed_on) continue;
      // A flowering annotation IS a bloom observation and can calibrate.
      // Anything else is a sighting: real, worth keeping, and not something
      // the model predicted, so it stays a note.
      const made = makeReport({
        regionId: region.id,
        tag: o.flowering ? "first_bloom" : "note",
        observedOn: o.observed_on,
        note: `${o.species}${o.scientificName ? ` (${o.scientificName})` : ""} — iNaturalist #${o.id}`,
        ...(o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : {}),
        ...(o.flowering ? { crop: o.species, stage: "flowering" } : {}),
      });
      if (typeof made !== "string") { saveReport(made); added++; }
    }
    setReports(listReports(region.id));
    setInat(null);
    setMsg(added
      ? `Imported ${added}. Bloom observations need a set-out date and an expected GDD before they can teach the model — add those on the rows that matter.`
      : "Nothing selected.");
  }

  const needsCrop = tag === "first_bloom" || tag === "emergence" || tag === "pest";
  const calibrating = tag === "first_bloom" || tag === "emergence";
  const usable = toObservations(reports).length;

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Field Reports</h1>
        <span className="text-[13px] text-ink-soft">{region.name}</span>
      </div>

      {/* ── What your ground has learned ─────────────────────────────────── */}
      <h2 className="figure mb-2.5 flex items-baseline gap-2.5 text-[18px] font-semibold">
        What your ground has learned
        {usable > 0 && <Provenance tool="goodearth_calibration" at={ranAt} onCost={onCost} />}
      </h2>

      {busy && !cal ? (
        <div className="rounded-md border border-rule bg-panel"><QuoteScroller heading="Reading your reports" /></div>
      ) : cal ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Bias title="Heat" s={cal.heat} unit="%" />
          <Bias title="First frost" s={cal.first_frost} unit=" days" />
          {Object.keys(cal.corrections).length > 0 && (
            <p className="sm:col-span-2 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-3.5 py-2.5 text-[13px]">
              Applied to your ground:{" "}
              {cal.corrections.heat_multiplier != null && (
                <b>heat × {cal.corrections.heat_multiplier}</b>
              )}
              {cal.corrections.heat_multiplier != null && cal.corrections.first_frost_offset_days != null && " · "}
              {cal.corrections.first_frost_offset_days != null && (
                <b>frost {cal.corrections.first_frost_offset_days > 0 ? "+" : ""}
                  {cal.corrections.first_frost_offset_days} days</b>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-rule bg-panel/60 p-5 text-[13px] leading-relaxed text-ink-soft">
          Nothing yet. Every other answer here comes from a 9 km grid refined by
          a terrain model — what it cannot know is the hedgerow, the pond, the
          outlet your cold air actually drains through. Frost and stage reports
          measure exactly that gap, and after a few of them your ground gets its
          own calendar instead of the region's.
        </div>
      )}

      {err && <p className="mt-3 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">{err}</p>}

      {/* ── File one ───────────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">File a report</h2>
      <form onSubmit={file} className="rounded-md border border-rule bg-panel p-4">
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTag(t.key)}
              className={`min-h-11 rounded-full border px-4 text-[13px] font-medium ${
                tag === t.key ? "border-ink bg-ink text-paper" : "border-rule active:bg-band"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-ink-soft">
          {TAGS.find((t) => t.key === tag)?.hint}
          {calibrating && " — this one teaches the model."}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft">Seen on
            <input name="on" type="date" defaultValue={today()}
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>

          {needsCrop && (
            <label className="block text-[11px] text-ink-soft">Crop
              <input name="crop" placeholder="Dahlia"
                className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
          )}
          {calibrating && (
            <>
              <label className="block text-[11px] text-ink-soft">Set out
                <input name="setout" type="date"
                  className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
              <label className="block text-[11px] text-ink-soft">Expected at (GDD)
                <input name="target" inputMode="numeric" placeholder="1200"
                  className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
            </>
          )}
        </div>

        <label className="mt-3 block text-[11px] text-ink-soft">Note
          <textarea name="note" rows={2} placeholder="Patchy in the hollow, bench untouched"
            className="mt-0.5 w-full rounded border border-rule bg-white px-2.5 py-2 text-[16px] focus:border-honey focus:outline-none" /></label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="min-h-11 rounded border-[1.5px] border-ink bg-ink px-5 text-[13px] font-semibold text-paper">
            File report
          </button>
          <button type="button" onClick={pin}
            className="min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
            {here ? "Pinned ✓" : "Pin where I am"}
          </button>
          {msg && <span className="text-[12.5px] text-ink-soft">{msg}</span>}
        </div>
      </form>

      {/* ── Import ─────────────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">🔭 Import from iNaturalist</h2>
      <div className="rounded-md border border-rule bg-panel p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 text-[11px] text-ink-soft" style={{ minWidth: 180 }}>
            iNaturalist username
            <input value={inatUser} onChange={(e) => setInatUser(e.target.value)}
              placeholder="your-login"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" />
          </label>
          <button onClick={pullINat} disabled={inatBusy || !inatUser.trim()}
            className="min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper disabled:opacity-40">
            {inatBusy ? "Fetching…" : "Find observations"}
          </button>
        </div>
        <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-soft">
          Read-only, and bounded to {region.name} — an unbounded search would
          bring back your holidays as well as your farm. Observations annotated
          as flowering come in as bloom reports, which the calibration loop can
          use; everything else comes in as a sighting, because iNaturalist does
          not know what you set out or when.
        </p>

        {inat && inat.length > 0 && (
          <>
            <div className="mt-3 max-h-64 overflow-auto overscroll-contain rounded border border-rule">
              {inat.map((o) => (
                <label key={o.id}
                  className="flex min-h-11 items-center gap-3 border-b border-rule px-3 py-2 last:border-b-0">
                  <input type="checkbox" checked={picked.has(o.id)}
                    onChange={() => setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(o.id)) n.delete(o.id); else n.add(o.id);
                      return n;
                    })}
                    className="h-5 w-5 shrink-0 accent-[color:var(--color-growth)]" />
                  <span className="min-w-0 flex-1 text-[13px]">
                    {o.species}
                    {o.flowering && <span className="ml-1.5 rounded-full bg-growth/12 px-2 py-0.5 text-[10.5px] font-semibold text-growth">flowering</span>}
                    <span className="data ml-2 text-[11px] text-ink-soft">{o.observed_on}</span>
                  </span>
                </label>
              ))}
            </div>
            <button onClick={importPicked}
              className="mt-3 min-h-11 rounded border-[1.5px] border-ink bg-ink px-5 text-[13px] font-semibold text-paper">
              Import {picked.size} selected
            </button>
          </>
        )}
      </div>

      {/* ── The log ────────────────────────────────────────────────────── */}
      {reports.length > 0 && (
        <>
          <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">
            Log <span className="text-[13px] font-normal text-ink-soft">
              {reports.length} report{reports.length === 1 ? "" : "s"} · {usable} teaching the model
            </span>
          </h2>
          <ul className="space-y-2">
            {reports.map((r) => {
              const t = TAGS.find((x) => x.key === r.tag);
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-md border border-rule bg-panel px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold">{t?.label}</span>
                    {r.crop && <span className="text-[13px]"> · {r.crop}</span>}
                    <span className="data ml-2 text-[11px] text-ink-soft">{nice(r.observedOn)}</span>
                    {r.lat != null && (
                      <span className="data ml-2 text-[10px] text-ink-soft">
                        {r.lat.toFixed(4)}, {r.lng!.toFixed(4)}
                      </span>
                    )}
                    {r.note && <p className="mt-0.5 text-[12.5px] text-ink-soft">{r.note}</p>}
                  </div>
                  <button onClick={() => setReports(deleteReport(r.id).filter((x) => x.regionId === region.id))}
                    aria-label="Delete report"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-5 max-w-prose text-[12px] leading-relaxed text-ink-soft">
        Reports stay on your device until you ask what they add up to. Nothing
        is applied to your block silently — a correction appears only once
        several observations agree, and the reports behind it are always listed.
      </p>
    </>
  );
}

function Bias({ title, s, unit }: {
  title: string;
  s: { median?: number; n?: number; confidence?: string; reading?: string; applicable?: boolean;
       rejected_as_implausible?: number };
  unit: string;
}) {
  const pct = unit === "%" && s.median != null ? s.median * 100 : s.median;
  return (
    <div className="rounded-md border border-rule bg-panel px-3.5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">{title}</span>
        {s.confidence && (
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
            CONFIDENCE[s.confidence] ?? "bg-band text-ink-soft"}`}>
            {s.confidence}
          </span>
        )}
      </div>
      <div className={`figure mt-1 text-[24px] ${s.applicable ? "" : "opacity-45"}`}>
        {pct == null ? "—" : `${pct > 0 ? "+" : ""}${Math.abs(pct) < 10 ? pct.toFixed(1) : pct.toFixed(0)}${unit}`}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{s.reading}</p>
      {!!s.rejected_as_implausible && (
        <p className="data mt-1 text-[10px] text-ink-soft">
          {s.rejected_as_implausible} set aside as implausible
        </p>
      )}
    </div>
  );
}
