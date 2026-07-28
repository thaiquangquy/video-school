// Minimal service worker: caches the static app shell (icons, manifest) so
// the installed PWA has an icon/name available even on a flaky connection.
// Intentionally does NOT cache API responses or video files — progress data
// must always be fresh, and video files are far too large for the Cache API
// to be a sane place to store them. This app still requires a live
// connection to the server on your local network to actually watch lessons.
const CACHE_NAME = "homeschool-tracker-shell-v1";
const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellAsset = SHELL_ASSETS.includes(url.pathname);

  if (!isShellAsset || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
