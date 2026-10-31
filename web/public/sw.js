// Outdraft's service worker: makes the app installable and keeps a copy of
// the app itself (page, scripts, styles, icons) so it opens with no
// connection. League data and Projections are saved separately by the app
// (src/offlineCache.ts), which also shows how old they are.
const SHELL = "outdraft-shell-v1";
const PAGE = "/index.html";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("outdraft-shell-") && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

const isAsset = (url) =>
  url.origin === location.origin &&
  (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") ||
   url.pathname === "/favicon.svg" || url.pathname === "/manifest.webmanifest");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Pages: the network first, so updates arrive; the saved page when offline.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) await cache.put(PAGE, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(PAGE)) ?? Response.error();
      }
    })());
    return;
  }

  // Built files have a content hash in their name, so a saved copy is always right.
  if (isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const saved = await cache.match(request);
      if (saved) return saved;
      const fresh = await fetch(request);
      if (fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    })());
  }
  // Everything else (the FPL relay, Projections, the calendar) goes to the network as usual.
});
