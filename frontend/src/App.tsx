// Good Earth — app root.
//
// Identity is the fleet's, not ours: NpubGate, the proof envelope in lib/mcp,
// the session nsec, and the Nostr profile panel are shared modules. What is
// specific to Good Earth is everything below the gate — the region scoping and
// the views that read from it.

import { useCallback, useEffect, useState } from "react";
import AppShell, { type ViewKey } from "./components/AppShell";
import Hive, { hiveMood } from "./components/Hive";
import Bees from "./components/Bees";
import NpubGate from "./components/NpubGate";
import NostrProfilePanel from "./components/NostrProfilePanel";
import Preferences from "./components/Preferences";
import AccountSummary from "./components/AccountSummary";
import { readPrefs, writePrefs, type Prefs } from "./lib/prefs";
import HeatLedger from "./views/HeatLedger";
import Crops from "./views/Crops";
import Pests from "./views/Pests";
import MapView from "./views/MapView";
import FieldReports from "./views/FieldReports";
import Almanac from "./views/Almanac";
import Wildlife from "./views/Wildlife";
import References from "./views/References";
import About from "./views/About";
import TodoView from "./views/Todo";
import Favorites from "./views/Favorites";
import { AVATAR_EVENT, avatarFor, hydrateAvatarFromNostr } from "./lib/avatar";
import { fetchProfile } from "./lib/nostrProfile";
import { checkBalance, getStoredNpub, isLoggedIn, logOut, onProofExpired, type FrostWindowResult } from "./lib/mcp";
import {
  getActiveRegionId, listRegions, saveRegion, setActiveRegionId, type SavedRegion,
} from "./lib/regions";

/// The day's high — the temperature that decides whether bees are working.
///
/// This used to read tonight's low on the coldest ground, which is a FROST
/// question, not a foraging one. Bees do not fly at night, so a 78 °F autumn
/// afternoon with a 55 °F night showed a single bee dozing at the door.
function todayHigh(f: FrostWindowResult | null): number | null {
  return f?.nights?.[0]?.high_f ?? null;
}


/// A watch is live if any night in the outlook reaches at least a frost watch.
function frostWatchLive(f: FrostWindowResult | null): boolean {
  return !!f?.nights?.some((n) => n.level !== "clear");
}

/// The top bar's conditions line. Quiet, and only what we actually know.
///
/// Glyphs carry the category so the eye can skip to the number it wants
/// without reading the words — the same trick the Almanac uses, and the reason
/// that page scans faster than a sentence does.
function conditions(f: FrostWindowResult | null) {
  const n = f?.nights?.[0];
  if (!n) return null;
  const cold = n.low_ground_f <= 40;
  const cloud = n.cloud_pct == null ? null
    : n.cloud_pct >= 70 ? "☁️" : n.cloud_pct >= 30 ? "⛅" : "🌙";
  const wind = n.wind_mph == null ? null
    : n.wind_mph >= 25 ? "💨" : n.wind_mph >= 13 ? "🌬️" : "🍃";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <span>
        <span className="mr-1">{cold ? "🥶" : "🌡️"}</span>
        Tonight <b className="figure text-[15px] text-ink">{Math.round(n.low_ground_f)}°F</b>
        <span className="text-ink-soft"> on low ground</span>
      </span>
      {wind && (
        <span><span className="mr-1">{wind}</span>{Math.round(n.wind_mph!)} mph</span>
      )}
      {cloud && (
        <span><span className="mr-1">{cloud}</span>{Math.round(n.cloud_pct!)}% cloud</span>
      )}
      {n.dew_point_f != null && (
        <span><span className="mr-1">💧</span>{Math.round(n.dew_point_f)}°F dew</span>
      )}
    </span>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(isLoggedIn);
  const [notice, setNotice] = useState<string | undefined>();
  const [view, setView] = useState<ViewKey>("ledger");
  const [avatar, setAvatar] = useState(() => avatarFor(getStoredNpub()));
  const [displayName, setDisplayName] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  const [frost, setFrost] = useState<FrostWindowResult | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());

  const [region, setRegion] = useState<SavedRegion>(() => {
    const all = listRegions();
    const id = getActiveRegionId();
    return all.find((r) => r.id === id) ?? all[0];
  });

  // A paid call can bounce for an expired proof from anywhere; the gate
  // re-arms rather than stranding the grower on a page that will not load.
  useEffect(() => onProofExpired((m) => { setSignedIn(false); setNotice(m); }), []);

  useEffect(() => {
    if (!signedIn) return;
    const npub = getStoredNpub();
    void hydrateAvatarFromNostr(npub);
    const sync = () => setAvatar(avatarFor(npub));
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    void fetchProfile(npub).then((p) => {
      if (p) setDisplayName(p.display_name || p.name || "");
    });
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [signedIn]);

  const refreshBalance = useCallback(async () => {
    try {
      const b = await checkBalance();
      if (typeof b.balance_api_sats === "number") setBalance(b.balance_api_sats);
    } catch { /* the chip shows an em dash rather than a wrong number */ }
  }, []);

  useEffect(() => { if (signedIn) void refreshBalance(); }, [signedIn, refreshBalance]);

  const pickRegion = useCallback((r: SavedRegion) => {
    setActiveRegionId(r.id);
    setRegion(r);
  }, []);

  // The server measures the ground; cache what it reports so the picker can
  // show area and sample count without paying for a second call.
  const onMeasured = useCallback((areaHa: number, samples: number) => {
    setRegion((cur) => {
      if (cur.areaHa === areaHa && cur.sampleCount === samples) return cur;
      const next = { ...cur, areaHa, sampleCount: samples };
      if (next.id !== "example-champlain") saveRegion(next);
      return next;
    });
  }, []);

  const onCost = useCallback((sats: number) => {
    if (sats > 0) { setSpent((s) => s + sats); void refreshBalance(); }
  }, [refreshBalance]);

  if (!signedIn) {
    return <NpubGate onLogin={() => { setSignedIn(true); setNotice(undefined); }} notice={notice} />;
  }

  return (
    <>
      {/* The skep in the rail's foot reads the same night the frost card does,
          so the two can never disagree: tonight's low on the coldest ground
          against the 55°F flight threshold, and shut on a live frost watch. */}
      <AppShell
        view={view}
        onView={setView}
        npub={getStoredNpub()}
        avatar={avatar}
        displayName={displayName}
        region={region}
        onRegion={pickRegion}
        conditions={conditions(frost)}
        hive={prefs.bees ? <Hive mood={hiveMood(todayHigh(frost), frostWatchLive(frost))} /> : undefined}
      >
        {view === "ledger" && (
          <HeatLedger region={region} onMeasured={onMeasured} onCost={onCost} onFrost={setFrost} onView={setView} />
        )}
        {view === "map" && <MapView active={region} onSaved={(r) => { pickRegion(r); setView("ledger"); }} />}
        {view === "almanac" && <Almanac region={region} onCost={onCost} />}
        {view === "crops" && <Crops region={region} onCost={onCost} />}
        {view === "wildlife" && <Wildlife region={region} onCost={onCost} />}
        {view === "pests" && <Pests region={region} onCost={onCost} />}
        {view === "reports" && <FieldReports region={region} onCost={onCost} />}
        {view === "favorites" && <Favorites active={region} onPick={pickRegion} />}
        {view === "todo" && <TodoView region={region} onCost={onCost} />}
        {view === "references" && <References />}
        {view === "about" && <About />}
        {view === "account" && (
          <>
            <h1 className="figure mb-4 text-[26px] font-bold">Account</h1>
            <AccountSummary balanceSats={balance} spentToday={spent}
              onSignOut={() => { logOut(); setSignedIn(false); }} />
            <NostrProfilePanel npub={getStoredNpub()} />
            <Preferences prefs={prefs} onChange={(p) => setPrefs(writePrefs(p))} />
          </>
        )}
      </AppShell>

      {/* The foragers work the whole page. pointer-events:none throughout, so
          a bee can never swallow a tap on a frost warning. */}
      <Bees mood={hiveMood(todayHigh(frost), frostWatchLive(frost))}
        tempF={todayHigh(frost)} enabled={prefs.bees} />
    </>
  );
}
