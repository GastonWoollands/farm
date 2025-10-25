// LiveStock PWA Service Worker
const CACHE_NAME = 'livestock-v1.0.0'
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/logo.jpg'
]

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache')
        return cache.addAll(urlsToCache)
      })
      .catch((error) => {
        console.log('Cache install failed:', error)
      })
  )
})

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response
        }
        
        // Clone the request because it's a stream
        const fetchRequest = event.request.clone()
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }
          
          // Clone the response because it's a stream
          const responseToCache = response.clone()
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache)
            })
          
          return response
        }).catch(() => {
          // Return offline page or fallback
          if (event.request.destination === 'document') {
            return caches.match('/')
          }
        })
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
})

// Background sync for offline data
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Sync offline data when connection is restored
      syncOfflineData()
    )
  }
})

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nueva actualización disponible',
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Ver detalles',
        icon: '/logo.jpg'
      },
      {
        action: 'close',
        title: 'Cerrar',
        icon: '/logo.jpg'
      }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification('LiveStock', options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    )
  }
})

// Helper function to sync offline data
async function syncOfflineData() {
  try {
    // This would integrate with your API service
    console.log('Syncing offline data...')
    // Implementation would depend on your specific sync logic
  } catch (error) {
    console.error('Sync failed:', error)
  }
}
