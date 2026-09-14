// Opens Good Earth with no signal.
//
// The installed app is for the field, and the field is where the signal is
// worst. Without this, tapping the icon out there showed the browser's own
// "you are offline" page — so the outbox that keeps a grower's entries was
// unreachable exactly when it was needed.
//
// What it keeps is the app itself and nothing else: the page, its scripts and
// styles, the icons. Never a grower's record, never an answer — those come
// from the MCP, on another origin, and this never touches another origin.
//
// The page is network-first, so a new deploy is picked up on the next load
// with signal. Scripts and styles are content-hashed by the build, so the
// cached copy of a name is always the right one.

const SHELL = "goodearth-shell-v1";
const ASSET_LIMIT = 60;
const EXTRAS = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== SHELL) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/assets/")) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req, url));
});

/// The page and every file it names, so the first cold open without signal
/// already works — not only the second.
async function precache() {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch("/", { cache: "no-store" });
    if (!res.ok) return;
    const html = await res.clone().text();
    await cache.put("/", res);
    const named = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await Promise.all([...named, ...EXTRAS].map(async (path) => {
      try {
        const r = await fetch(path);
        if (r.ok) await cache.put(path, r);
      } catch { /* one missing icon must not cost the page */ }
    }));
  } catch { /* installed without signal: the next load with signal fills it */ }
}

/// Hash routes all load "/", so the page is kept under that one key. Other
/// same-origin files (llms.txt, the icons) keep their own.
function keyFor(req, url) {
  return url.pathname === "/" || url.pathname === "/index.html" ? "/" : req;
}

async function networkFirst(req, url) {
  const cache = await caches.open(SHELL);
  const key = keyFor(req, url);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key)) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    await trim(cache);
  }
  return res;
}

/// Old builds' files are never asked for again. Keep the newest few dozen.
async function trim(cache) {
  const assets = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/assets/"));
  for (const old of assets.slice(0, Math.max(0, assets.length - ASSET_LIMIT))) await cache.delete(old);
}
