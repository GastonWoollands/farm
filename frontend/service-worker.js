// LiveStock PWA Service Worker
// IMPORTANT: Increment this version when deploying updates!
const VERSION = 'v5';
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
  console.log(`[SW] Installing version ${VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS))
  );
  // Force the waiting service worker to become the active one
  self.skipWaiting();
});

// Listen for skip waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message, activating new version');
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating version ${VERSION}`);
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((k) => k !== STATIC_CACHE)
      .map((k) => caches.delete(k))
    )).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Network-first for HTML, Stale-While-Revalidate for assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Skip non-GET requests and API calls
  if (req.method !== 'GET') return;
  if (new URL(req.url).pathname.startsWith('/api')) return;
  
  const isNavigate = req.mode === 'navigate';
  const isStatic = ASSETS.some((a) => new URL(a, self.location.origin).href === req.url);
  
  // For navigation requests - Network first, cache fallback
  if (isNavigate) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          // Clone and cache the response
          const responseToCache = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(req, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Offline - serve from cache
          return caches.match('/index.html');
        })
    );
    return;
  }
  
  // For static assets - Stale-While-Revalidate
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req).then((networkResponse) => {
          // Update cache with fresh version
          if (networkResponse.ok) {
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(req, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);
        
        // Return cached version immediately (if exists), else wait for network
        return cachedResponse || fetchPromise;
      })
    );
  }
});

