// An answer a page has already asked for, held long enough to flip back to.
//
// The app renders one view at a time, so leaving the Dashboard unmounts it and
// coming back asks the server the whole question again — a fare and a wait for
// a season that has not moved since the grower looked at it ninety seconds
// ago. This holds the PROMISE, not just the result, which is what lets a page
// join a request that is still in the air instead of starting a second one.
//
// That is also what makes warming a page worth doing: the peer page's call is
// started early and the view, when it mounts, awaits the very same promise.
//
// Three things it must not do:
//
// **Never remember a failure.** A rejected call, or one that came back
// `success: false`, is dropped, so the "Try again" button tries again rather
// than being handed the same refusal for the next five minutes.
//
// **Never outlive the question.** The key carries the block, so a different
// plot is a different answer and nothing has to be invalidated by hand. Time
// is the other half: a reading has a time printed on it, and one from before
// lunch should not be presented at four o'clock as though it were fresh.
//
// **Never grow.** A grower with a dozen plots flipping between two pages could
// otherwise accumulate a row per plot per tool for the life of the tab.

/// How long an answer may be served without asking again.
///
/// Long enough to cover flipping between two pages and back, short enough that
/// a reader who leaves the tab open over lunch is not shown the morning. The
/// server's own weather cache uses three hours for the running day; this is
/// not that number and should not be — that one decides how often UPSTREAM is
/// asked, this one decides how stale a printed reading time may be.
export const TTL_MS = 5 * 60 * 1000;

/// Entries kept before the oldest is dropped.
const MAX = 24;

interface Entry {
  at: number;
  promise: Promise<unknown>;
}

const held = new Map<string, Entry>();

/// Test seam. Production passes nothing and gets the wall clock.
let clock: () => number = () => Date.now();
export function useClock(fn: () => number): void { clock = fn; }

function fresh(e: Entry | undefined, now: number): e is Entry {
  return !!e && now - e.at < TTL_MS;
}

/// The answer to `key`, asking only if we do not already have it coming.
export function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const now = clock();
  const have = held.get(key);
  if (fresh(have, now)) return have.promise as Promise<T>;

  const promise = run().then(
    (value) => {
      // A tool that answers "no" has not answered. Holding it would make the
      // next five minutes of retries pointless.
      if (value && typeof value === "object" && (value as { success?: boolean }).success === false) {
        held.delete(key);
      }
      return value;
    },
    (err) => { held.delete(key); throw err; },
  );

  held.set(key, { at: now, promise });
  while (held.size > MAX) {
    const oldest = [...held.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!oldest) break;
    held.delete(oldest[0]);
  }
  return promise;
}

/// Start `run` if it is not already going, and care nothing for the outcome.
///
/// This is the warming path. A rejection here is not an error anybody asked
/// about — nobody is looking at that page — so it is swallowed rather than
/// left to surface as an unhandled rejection in a browser console.
export function warm<T>(key: string, run: () => Promise<T>): void {
  void cached(key, run).catch(() => {});
}

/// Forget an answer, so the next ask is a real one. Used by a refresh button.
export function forget(key: string): void { held.delete(key); }

/// Forget everything. Used when the grower signs out — a held answer is about
/// their ground, and it should not survive them leaving.
export function forgetAll(): void { held.clear(); }

/// Whether an answer is being held for `key`. For tests and for a caller that
/// wants to know whether a page will paint instantly.
export function isHeld(key: string): boolean {
  return fresh(held.get(key), clock());
}
