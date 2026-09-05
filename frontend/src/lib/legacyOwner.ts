// Who this browser's legacy pile belongs to.
//
// The stores `migrateBlocks` lifts are UNSCOPED — one `goodearth:plantings:v1`
// for the whole browser, from before anything was keyed by npub. Lifting them
// is a WRITE to whichever account is signed in, so the question "are these
// ours?" has to be answered before the upload, not after.
//
// It was answered per-npub, on this reasoning from `migrateBlocks`'s header:
//
//   "Its sentinel is global rather than per-patron, so a second npub on the
//    same browser is told the work is already done."
//
// Right for a per-patron store, backwards for a shared one. A second npub was
// told the work was NOT done, read the first patron's farm and uploaded it to
// its own record. Reported 2026-09-05 by a grower who generated a fresh key
// and was greeted by someone else's ground — in Favorites, and in the calendar
// feed's offer to publish it.
//
// Its own module, and free of imports, so the rule can be tested. Everything
// around it is network I/O the node runner cannot load.

const OWNER_KEY = "goodearth:legacy-owner:v1";

/// May this npub lift the legacy pile?
///
/// The first to ask claims it; everyone after is refused. The claim is
/// deliberately made on ASKING rather than on succeeding, so a pass that dies
/// halfway can be retried by its owner — which is what the per-npub sentinel
/// was protecting, and that part was right.
export function claimLegacy(npub: string): boolean {
  if (!npub) return false;
  try {
    const owner = window.localStorage.getItem(OWNER_KEY);
    if (!owner) {
      window.localStorage.setItem(OWNER_KEY, npub);
      return true;
    }
    return owner === npub;
  } catch {
    // Storage that cannot remember an owner cannot show the pile is ours, and
    // uploading someone else's farm is worse than migrating nothing.
    return false;
  }
}
