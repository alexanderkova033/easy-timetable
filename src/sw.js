/**
 * Offline-friendly cache: after a successful online load, assets are cached
 * for subsequent offline sessions (same origin).
 */
const CACHE = "easy-timetable-offline-v2";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then(hit => {
          if (hit) return hit;
          if (request.mode === "navigate" || request.destination === "document") {
            return caches.match("/index.html").then(doc => doc || Response.error());
          }
          return Response.error();
        }),
      ),
  );
});
