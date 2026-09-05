// Good Earth — app root.
//
// Identity is the fleet's, not ours: NpubGate, the proof envelope in lib/mcp,
// the session nsec, and the Nostr profile panel are shared modules. What is
// specific to Good Earth is everything below the gate — the region scoping and
// the views that read from it.

import { useCallback, useEffect, useState } from "react";
import AppShell, { type ViewKey } from "./components/AppShell";
import { DEFAULT_VIEW, GUEST_VIEW, onRouteChange, viewFromHash, writeView } from "./lib/route";
import { isPublic } from "./lib/views";
import Hive, { hiveMood } from "./components/Hive";
import Bees from "./components/Bees";
import NpubGate from "./components/NpubGate";
import NostrProfilePanel from "./components/NostrProfilePanel";
import Preferences from "./components/Preferences";
import AccountSummary from "./components/AccountSummary";
import CalendarFeed from "./components/CalendarFeed";
import { readPrefs, themeOf, writePrefs, type Prefs } from "./lib/prefs";
import FirstRun from "./components/FirstRun";
import ForgetMe from "./components/ForgetMe";
import GuestShell from "./components/GuestShell";
import { UnitProvider } from "./components/Units";
import LifeOfAPest from "./views/LifeOfAPest";
import LifeOfAPlant from "./views/LifeOfAPlant";
import LifeOfAnAnimal from "./views/LifeOfAnAnimal";
import LifeOfATree from "./views/LifeOfATree";
import Welcome from "./views/Welcome";
import { showTemp, type Unit } from "./lib/units";
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
import {
  blockList, checkBalance, getStoredNpub, isLoggedIn, logOut, onProofExpired,
  type BlockRow, type FrostWindowResult,
} from "./lib/mcp";
import {
  EXAMPLE_REGION, getActiveRegionId, hydrate, listRegions, setActiveRegionId,
  type SavedRegion,
} from "./lib/regions";
import { migrateToBlocks } from "./lib/migrateBlocks";

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
function conditions(f: FrostWindowResult | null, unit: Unit) {
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
        Tonight <b className="figure text-[15px] text-ink">{showTemp(n.low_ground_f, unit)}</b>
        <span className="text-ink-soft"> on low ground</span>
      </span>
      {wind && (
        <span><span className="mr-1">{wind}</span>{Math.round(n.wind_mph!)} mph</span>
      )}
      {cloud && (
        <span><span className="mr-1">{cloud}</span>{Math.round(n.cloud_pct!)}% cloud</span>
      )}
      {n.dew_point_f != null && (
        <span><span className="mr-1">💧</span>{showTemp(n.dew_point_f, unit)} dew</span>
      )}
    </span>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(isLoggedIn);
  const [notice, setNotice] = useState<string | undefined>();
  // The URL owns the view, so a refresh keeps the tab the reader was on.
  // A hash that NAMES a view wins for everyone — a bookmark of `#/ledger`
  // should still take a returning grower there, and take a stranger to the
  // gate and then there. It is the empty hash that differs: the bare domain
  // means "show me what this is" to a visitor and "my farm" to a grower.
  const [view, setView] = useState<ViewKey>(
    () => viewFromHash(window.location.hash) ?? (isLoggedIn() ? DEFAULT_VIEW : GUEST_VIEW),
  );
  const [avatar, setAvatar] = useState(() => avatarFor(getStoredNpub()));
  const [displayName, setDisplayName] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  const [frost, setFrost] = useState<FrostWindowResult | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  /// Whether a visitor has asked to sign in. Separate from `signedIn` so the
  /// gate is somewhere they CHOSE to go rather than the wall they hit.
  const [asking, setAsking] = useState(false);
  /// Whether the server's blocks have arrived. Used in exactly two places —
  /// the Favorites empty state and MapView's save button — and threaded no
  /// further, because everything else reads the cache and does not care.
  const [blocksSynced, setBlocksSynced] = useState(false);
  /// Whether the grower has asked to see the worked example. Until they do, a
  /// patron with no ground is ASKED for some rather than handed Vermont.
  const [showingExample, setShowingExample] = useState(false);

  const [region, setRegion] = useState<SavedRegion>(() => {
    const all = listRegions();
    const id = getActiveRegionId();
    return all.find((r) => r.id === id) ?? all[0];
  });

  // Keep the URL and the state pointing at each other: this writes the hash
  // when a tab is picked, and follows it when the reader uses back, forward,
  // or opens a link.
  useEffect(() => { writeView(view); }, [view]);

  // One attribute on the root, and every token follows — including inside the
  // SVG charts, which read the same custom properties the buttons do. Set here
  // rather than in a provider because the guest shell and the app shell both
  // need it and neither is the other's parent.
  useEffect(() => {
    document.documentElement.dataset.theme = themeOf(prefs);
  }, [prefs]);
  useEffect(() => onRouteChange(setView, signedIn ? DEFAULT_VIEW : GUEST_VIEW), [signedIn]);

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

  // The blocks the server holds become the truth behind the cache. The grower
  // sees their ground immediately from localStorage and it is confirmed a
  // moment later, so this is a content update rather than a loading gate —
  // no spinner, and no route that waits.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void (async () => {
      await migrateToBlocks();
      const res = await blockList().catch(() => null);
      if (!live || !res?.success) return;
      // Seeded means the grower has saved NOTHING, and that is a fact to write
      // down rather than a reason to skip the write.
      //
      // This used to return early on the assumption that "the worked example
      // is already what the cache shows". It was not: the cache could hold
      // another patron's blocks, and returning here left them standing. A new
      // npub signed in and kept looking at a farm that was not theirs.
      const rows: SavedRegion[] = res.seeded ? [] : res.blocks.map((b: BlockRow) => ({
        id: b.block_id,
        name: b.name,
        region: b.geometry,
        baseTempF: b.base_temp_f ?? 50,
        areaHa: b.area_ha ?? undefined,
        sampleCount: b.sample_count ?? undefined,
      }));
      hydrate(rows);
      // Through `listRegions` rather than `rows`, so an empty record lands on
      // the worked example. `rows[0] ?? cur` kept the stale block precisely
      // when there was nothing to replace it with.
      const shown = listRegions();
      setRegion((cur) => shown.find((r) => r.id === cur.id) ?? shown[0] ?? cur);
      setBlocksSynced(true);
    })();
    return () => { live = false; };
  }, [signedIn]);

  const pickRegion = useCallback((r: SavedRegion) => {
    setActiveRegionId(r.id);
    setRegion(r);
  }, []);

  const onCost = useCallback((sats: number) => {
    if (sats > 0) { setSpent((s) => s + sats); void refreshBalance(); }
  }, [refreshBalance]);

  // A visitor gets the front door, not a password box.
  //
  // The gate still guards everything that names a grower or spends their
  // sats — `isPublic` is the list, and it holds only pages that read no block
  // and bill nothing. What changed is that a stranger can now read what this
  // is before being asked who they are, and `#/plant` in a shared link opens
  // rather than bouncing.
  if (!signedIn) {
    const login = () => { setSignedIn(true); setNotice(undefined); };
    if (asking || !isPublic(view)) {
      return <NpubGate onLogin={login} notice={notice} />;
    }
    return (
      <GuestShell view={view} onView={setView} onSignIn={() => setAsking(true)}>
        {view === "welcome" && <Welcome onView={setView} onSignIn={() => setAsking(true)} />}
        {view === "plant" && <LifeOfAPlant />}
        {view === "pest" && <LifeOfAPest />}
        {view === "tree" && <LifeOfATree />}
        {view === "animal" && <LifeOfAnAnimal />}
        {view === "about" && <About />}
        {view === "references" && <References />}
      </GuestShell>
    );
  }

  return (
    <>
      {/* The skep in the rail's foot reads the same night the frost card does,
          so the two can never disagree: tonight's low on the coldest ground
          against the 55°F flight threshold, and shut on a live frost watch. */}
      <UnitProvider value={prefs.units}>
      <AppShell
        view={view}
        onView={setView}
        npub={getStoredNpub()}
        avatar={avatar}
        displayName={displayName}
        region={region}
        onRegion={pickRegion}
        conditions={conditions(frost, prefs.units)}
        hive={prefs.bees ? <Hive mood={hiveMood(todayHigh(frost), frostWatchLive(frost))} /> : undefined}
      >
        {view === "ledger" && (
          // A patron with no ground of their own is asked for some. The
          // example is one tap away and says what it is; it used to be the
          // whole first impression, unlabelled and 500 miles from most people.
          blocksSynced && region.id === EXAMPLE_REGION.id && !showingExample ? (
            <FirstRun
              onSaved={(r) => { pickRegion(r); setShowingExample(false); }}
              onDraw={() => setView("map")}
              onExample={() => setShowingExample(true)}
            />
          ) : (
            <HeatLedger region={region} onCost={onCost} onFrost={setFrost} onView={setView} />
          )
        )}
        {view === "map" && <MapView active={region} onSaved={(r) => { pickRegion(r); setView("ledger"); }} />}
        {view === "almanac" && <Almanac region={region} onCost={onCost} />}
        {view === "crops" && <Crops region={region} onCost={onCost} />}
        {view === "wildlife" && <Wildlife region={region} onCost={onCost} />}
        {view === "pests" && <Pests region={region} onCost={onCost} />}
        {view === "reports" && <FieldReports region={region} onCost={onCost} />}
        {view === "favorites" && <Favorites active={region} onPick={pickRegion} synced={blocksSynced} />}
        {view === "todo" && <TodoView region={region} onCost={onCost} onView={setView} />}
        {view === "references" && <References />}
        {view === "about" && <About />}
        {/* Free reading, and not only for strangers — a grower who wants to
            know what a biofix is should not have to sign out to find out. */}
        {view === "welcome" && <Welcome onView={setView} onSignIn={() => {}} />}
        {view === "plant" && <LifeOfAPlant />}
        {view === "pest" && <LifeOfAPest />}
        {view === "tree" && <LifeOfATree />}
        {view === "animal" && <LifeOfAnAnimal />}
        {view === "account" && (
          <>
            <h1 className="figure mb-4 text-[26px] font-bold">Account</h1>
            <AccountSummary balanceSats={balance} spentToday={spent}
              onSignOut={() => { logOut(); setSignedIn(false); }} />
            <NostrProfilePanel npub={getStoredNpub()} />
            {/* Publishing is a once-per-region setup step, so it sits with the
                other settings rather than at the top of the working page. */}
            <CalendarFeed region={region} />
            <Preferences prefs={prefs} onChange={(p) => setPrefs(writePrefs(p))} />
            {/* Last on the page, because it is the one control here that
                cannot be taken back. */}
            <ForgetMe onForgotten={() => {
              setSignedIn(false);
              setRegion(listRegions()[0]);
              setView(GUEST_VIEW);
              setNotice("Your ground is forgotten. You are still a patron here.");
            }} />
          </>
        )}
      </AppShell>
      </UnitProvider>

      {/* The foragers work the whole page. pointer-events:none throughout, so
          a bee can never swallow a tap on a frost warning. */}
      <Bees mood={hiveMood(todayHigh(frost), frostWatchLive(frost))}
        tempF={todayHigh(frost)} enabled={prefs.bees} />
    </>
  );
}
