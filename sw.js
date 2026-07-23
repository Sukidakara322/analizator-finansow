// Service worker — praca offline + zawsze świeża wersja po wdrożeniach.
// Strategia: pliki aplikacji serwowane z cache (szybki start), a w tle zawsze
// dociągana jest świeża wersja z sieci (stale-while-revalidate). Dzięki temu
// po każdym wdrożeniu wystarczy ponowne otwarcie aplikacji.
const CACHE = 'analizator-v13';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './renderer.js',
  './cloud.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Instalacja: pobierz pliki ZAWSZE świeże z sieci (z pominięciem cache HTTP przeglądarki).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting())
  );
});

// Aktywacja: usuń stare wersje pamięci podręcznej.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pliki aplikacji: z cache od razu + odświeżenie w tle (zawsze aktualne przy następnym otwarciu).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req, { cache: 'no-cache' })
          .then((resp) => {
            if (resp && resp.status === 200) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => null);
        if (cached) return cached;
        const fresh = await network;
        return fresh || cache.match('./index.html');
      })
    );
    return;
  }

  // Biblioteka Firebase (gstatic, adresy wersjonowane): cache-first.
  if (url.origin === 'https://www.gstatic.com') {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      }))
    );
  }
  // googleapis (baza/logowanie) — zawsze przez sieć; offline obsługuje pamięć Firestore.
});
