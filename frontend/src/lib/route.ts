// The view, in the URL.
//
// The view used to live only in React state, so a browser refresh dropped it
// and dumped the reader back on the ledger — including a refresh they did to
// re-read the page they were already on. Putting it in the location hash
// makes refresh keep the tab, back and forward walk the tabs, and a link
// carry the page the sender was looking at.
//
// A hash rather than a path on purpose: this is a static site on Pages, and a
// path route would 404 on refresh unless the host is told to rewrite every
// unknown path to index.html. A hash never reaches the server.
//
// The region is deliberately NOT in the URL. Region ids are local to a
// device, so a link carrying one would resolve to a different farm — or to
// nothing — for whoever opened it.

// Extension spelled out because VIEW_KEYS is a VALUE import: a type-only
// import is stripped before it ever resolves, but this one has to resolve at
// runtime, and the node test runner will not guess the extension.
import { VIEW_KEYS, type ViewKey } from "./views.ts";

export const DEFAULT_VIEW: ViewKey = "ledger";

function isView(v: string): v is ViewKey {
  return (VIEW_KEYS as readonly string[]).includes(v);
}

/// The view named by the current URL, or null if it names none.
export function viewFromHash(hash: string): ViewKey | null {
  const raw = hash.replace(/^#\/?/, "").trim().toLowerCase();
  return raw && isView(raw) ? raw : null;
}

export function readView(): ViewKey {
  try {
    return viewFromHash(window.location.hash) ?? DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

/// Point the URL at a view.
///
/// Writing the same view twice is a no-op: re-selecting the tab you are on
/// should not stack history entries the back button then has to walk.
///
/// The first write REPLACES rather than pushes. Arriving with no hash, or on
/// a link naming no view, and then pushing the default would put an entry
/// behind the reader that looks identical to where they are — so their first
/// press of back would appear to do nothing. Only a deliberate change of tab
/// is worth a history entry.
export function writeView(view: ViewKey): void {
  try {
    const current = viewFromHash(window.location.hash);
    if (current === view) return;
    const url = `#/${view}`;
    if (current === null && window.history?.replaceState) {
      window.history.replaceState(null, "", url);
    } else {
      window.location.hash = url;
    }
  } catch {
    /* A browser that refuses the hash still gets a working app. */
  }
}

export function onRouteChange(cb: (view: ViewKey) => void): () => void {
  const handler = () => cb(readView());
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
}
