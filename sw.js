// Service worker — pozwala aplikacji działać offline (po pierwszym wczytaniu).
const CACHE = 'analizator-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './storage.js',
  './renderer.js',
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

// Pobieranie: najpierw z pamięci podręcznej, w razie braku z sieci (fallback do index.html).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match('./index.html'));
    })
  );
});
