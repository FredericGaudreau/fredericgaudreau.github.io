"use strict";

const SW_CACHE_NAME = "site-cache-v4";
const SW_PRECACHE_URLS = [
  "/",
  "/index.html",
  "/map.html",
  "/carte.html",
  "/apropos.html",
  "/notes.html",
  "/404.html",
  "/manifest.webmanifest",
  "/src/css/style.css",
  "/src/css/notes.css",
  "/src/js/index.js",
  "/src/js/markdown.js",
  "/src/js/map.js",
  "/src/js/notes.js",
  "/src/components/header.html",
  "/src/components/footer.html",
  "/src/images/favicon.png",
  "/src/images/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SW_CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          SW_PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SW_CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(SW_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/404.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(SW_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});
