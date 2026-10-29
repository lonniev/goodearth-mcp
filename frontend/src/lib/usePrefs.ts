// The grower's settings as React state, re-rendered when any part of the page
// sets them, when sign-in brings the account's, and when another tab does.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { onPrefsChange, prefsSnapshot, readPrefs, writePrefs, type Prefs } from "./prefs";

function subscribe(changed: () => void): () => void {
  const stop = onPrefsChange(changed);
  window.addEventListener("storage", changed);
  return () => {
    stop();
    window.removeEventListener("storage", changed);
  };
}

export function usePrefs(): [Prefs, (next: Prefs) => void] {
  const raw = useSyncExternalStore(subscribe, prefsSnapshot, () => "");
  // Read again only when the stored text changed: `raw` is that text.
  const prefs = useMemo(() => readPrefs(), [raw]);
  const set = useCallback((next: Prefs) => void writePrefs(next), []);
  return [prefs, set];
}
