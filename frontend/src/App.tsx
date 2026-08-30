// Good Earth — app shell.
//
// T1 scope: prove the borrowed identity path end to end and put one real
// answer on screen. Sign-in, the proof envelope, and the Nostr profile panel
// are the fleet's existing modules (lib/mcp, NpubGate, NostrProfilePanel) —
// nothing about identity is reimplemented here.
//
// The map, Heat Ledger view, Crops, Pests, To-Do, Field Reports and the
// grazing skep land in later phases.

import { useCallback, useEffect, useState } from "react";
import NpubGate from "./components/NpubGate";
import NostrProfilePanel from "./components/NostrProfilePanel";
import Avatar from "./components/Avatar";
import { AVATAR_EVENT, avatarFor, hydrateAvatarFromNostr } from "./lib/avatar";
import {
  gddSeasonCurve,
  getStoredNpub,
  isLoggedIn,
  logOut,
  onProofExpired,
  type Region,
  type SeasonCurveResult,
} from "./lib/mcp";

// A worked example so a first-time visitor sees the shape of an answer
// before drawing anything: a block in the Champlain Valley.
const EXAMPLE_REGION: Region = {
  type: "Polygon",
  coordinates: [[
    [-73.24, 44.44],
    [-73.16, 44.44],
    [-73.16, 44.52],
    [-73.24, 44.52],
    [-73.24, 44.44],
  ]],
};

export default function App() {
  const [signedIn, setSignedIn] = useState(isLoggedIn);
  const [notice, setNotice] = useState<string | undefined>();
  const [result, setResult] = useState<SeasonCurveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [avatar, setAvatar] = useState(() => avatarFor(getStoredNpub()));

  // Seed the avatar from the patron's kind-0 on sign-in, and follow later
  // picks — the panel writes through a window event so the header updates
  // without a reload.
  useEffect(() => {
    if (!signedIn) return;
    const npub = getStoredNpub();
    void hydrateAvatarFromNostr(npub);
    const sync = () => setAvatar(avatarFor(npub));
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [signedIn]);

  // A paid call can bounce for an expired proof from anywhere; the gate
  // re-arms rather than stranding the grower on a page that won't load.
  useEffect(
    () =>
      onProofExpired((message) => {
        setSignedIn(false);
        setNotice(message);
      }),
    [],
  );

  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setResult(await gddSeasonCurve(EXAMPLE_REGION, 50));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!signedIn) {
    return <NpubGate onLogin={() => { setSignedIn(true); setNotice(undefined); }} notice={notice} />;
  }

  const gdd = result?.accumulated_gdd;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Avatar value={avatar} size={40} />
          <div>
            <h1 className="text-xl font-semibold">Good Earth</h1>
            <p className="text-sm text-stone-500">Answers for the ground you actually farm.</p>
          </div>
        </div>
        <button
          onClick={() => { logOut(); setSignedIn(false); }}
          className="text-xs text-stone-500 hover:text-stone-800"
        >
          Sign out
        </button>
      </header>

      <section className="rounded-xl border border-stone-200 p-5 mb-6">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
          Season heat — example block, Champlain Valley
        </div>

        <button
          onClick={run}
          disabled={busy}
          className="bg-amber-600 hover:bg-amber-500 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-40"
        >
          {busy ? "Reading the season…" : "Read the season"}
        </button>

        {error && (
          <div className="mt-3 rounded-lg p-3 text-xs bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {gdd && (
          <div className="mt-5">
            <div className="text-3xl font-semibold tabular-nums">{gdd.mean.toFixed(0)}</div>
            <div className="text-xs text-stone-500 mb-3">
              growing degree days, base {result!.base_temp_f}°F, since {result!.season_start}
            </div>

            {/* The spread IS the product — never collapse it to the mean. */}
            <div className="text-sm">
              <span className="font-medium">{gdd.spread.toFixed(0)} GDD</span> between the coolest
              and warmest ground in this block ({gdd.min.toFixed(0)}–{gdd.max.toFixed(0)}).
            </div>

            {result!.normals?.ahead_of_normal_gdd != null && (
              <div className="text-sm mt-1">
                {result!.normals!.ahead_of_normal_gdd! >= 0 ? "Ahead of" : "Behind"} the last{" "}
                {result!.normals!.span_years} seasons by{" "}
                {Math.abs(result!.normals!.ahead_of_normal_gdd!).toFixed(0)} GDD.
              </div>
            )}

            <div className="mt-4 text-[11px] text-stone-400 leading-relaxed">
              {result!.region.sample_count} sample points over{" "}
              {result!.region.area_km2.toFixed(1)} km² ·{" "}
              {result!.across_region.archive_cells_fetched} archive cell(s) · terrain correction{" "}
              {result!.across_region.terrain_correction}
            </div>
          </div>
        )}
      </section>

      <NostrProfilePanel npub={getStoredNpub()} />
    </div>
  );
}
