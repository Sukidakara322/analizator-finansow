// Service worker — pozwala aplikacji działać offline (po pierwszym wczytaniu).
const CACHE = 'analizator-v6';
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

// Instalacja: zapisz pliki aplikacji do pamięci podręcznej.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
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

// Pobieranie:
//  • pliki aplikacji i biblioteka Firebase (gstatic) -> najpierw cache, potem sieć (i zapisz do cache),
//  • wywołania do googleapis (baza/logowanie) -> zawsze przez sieć; offline obsługuje pamięć Firestore.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin || url.origin === 'https://www.gstatic.com';
  if (!cacheable) return; // googleapis itp. — nie przechwytujemy

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
