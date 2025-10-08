// Basic service worker for offline cache of static assets
const VERSION = 'v4';
const STATIC_CACHE = `static-${VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app/main.js',
  '/app.js',
  '/app/format.js',
  '/app/features/export.js',
  '/app/auth.js',
  '/config.js',
  '/db.js',
  '/manifest.json',
  '/icons/icon-192.jpg',
  '/icons/icon-512.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((k) => k !== STATIC_CACHE)
      .map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Cache-first for navigation and static assets; network-first for others
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isNavigate = req.mode === 'navigate';
  const isStatic = ASSETS.some((a) => new URL(a, self.location.origin).href === req.url);
  if (isNavigate || isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(req, resClone));
        return res;
      }).catch(() => caches.match('/index.html')))
    );
  }
});

