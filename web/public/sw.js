// Outdraft's service worker. For now it only makes the app installable: with
// no fetch handler, every request goes to the network as usual. Working
// offline on last-loaded data is a separate step (issue #16).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
