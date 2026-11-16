// Service worker: l'app funziona offline; l'archivio si aggiorna dalla rete quando possibile.
const VERSIONE = "v3";
const CACHE_APP = `million-day-app-${VERSIONE}`;
const CACHE_DATI = "million-day-dati";
const FILE_APP = [
  "./",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/logic.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(FILE_APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k.startsWith("million-day-app-") && k !== CACHE_APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/api/") && !url.pathname.endsWith("/api/estrazioni")) return;

  // Archivio: prima la rete (dati freschi), poi la copia salvata se si è offline.
  if (url.pathname.endsWith("/api/estrazioni")) {
    event.respondWith(
      fetch(event.request)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(CACHE_DATI).then((c) => c.put(event.request, copia));
          return risposta;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })),
    );
    return;
  }

  // File dell'app: prima la cache, poi la rete.
  event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
});
