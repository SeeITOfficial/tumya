const CACHE = "tumya-v2";
const SHELL = [
  "/",
  "/css/app.css",
  "/js/app.js",
  "/js/api.js",
  "/manifest.json",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Network-first for API calls (always want fresh data), cache-first for the app shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache API responses

  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request).catch(() => cached)),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Tumya", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Tumya", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { trackingCode: payload.trackingCode },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const code = event.notification.data?.trackingCode;
  event.waitUntil(clients.openWindow(code ? `/?track=${code}` : "/"));
});
