// Saving ground: to the record first, then to this browser.
//
// THE REGRESSION THIS FIXES. Nothing on the save path ever called `blockSave`.
// A drawn block reached the server only as a side effect: `saveRegion` wrote
// to `goodearth:regions:v1`, and `migrateToBlocks` — the one-time lift that
// "exists to be deleted" — read the same key on the next load and pushed it up.
//
// Scoping that key by npub, to stop one patron seeing another's farm, cut the
// wire. And the same change made a `seeded` response clear the cache rather
// than return early. Together: draw a block, reload, the server says you have
// nothing, and the local copy is wiped. The block is gone.
//
// So a save is a save. The server is told at the moment the grower acts, the
// cache follows, and the migration goes back to being what it says it is —
// a lift of what old devices are still holding.

import { blockSave } from "./mcp";
import { saveRegion, type SavedRegion } from "./regions";

/// Put ground on the record and in the cache. Throws with a readable message
/// if the record refuses, because a block that only exists in this browser is
/// exactly the state that lost one.
export async function saveBlock(r: SavedRegion): Promise<SavedRegion> {
  const res = await blockSave({
    block: r.id,
    name: r.name,
    geometry: r.region,
    base_temp: r.baseTempF,
  });
  // This used to make an exception for `error_code === "ambiguous_block"`, on
  // the reasoning that a name the record already holds means the block is
  // there. Two things were wrong with it. Nothing has ever sent that code —
  // the server RAISES on a clash and the SDK reports every such refusal as
  // `tool_input_invalid` — so the branch was inert and only looked like
  // handling. And the reasoning was wrong anyway: a clash means a DIFFERENT
  // block holds the name, so this one did not save, and swallowing it would
  // leave the cache holding ground the record has never seen. Which is the
  // exact state this module exists to prevent.
  if (!res?.success) {
    throw new Error(res?.error || "The record would not take this block.");
  }
  // The server measures it — area and sample count come back on the row — so
  // the cache takes what it returned rather than what was sent.
  const measured: SavedRegion = res.block
    ? {
        ...r,
        name: res.block.name ?? r.name,
        areaHa: res.block.area_ha ?? undefined,
        sampleCount: res.block.sample_count ?? undefined,
      }
    : r;
  saveRegion(measured);
  return measured;
}
