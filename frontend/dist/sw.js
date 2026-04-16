const CACHE_NAME = 'partiqule-v2';

// Assets to cache on install — the app shell
const PRECACHE_ASSETS = [
  '/',
  '/favicon-32.png',
  '/favicon-192.png',
  '/favicon-512.png',
];

// Install — cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls → network only, never cache
// - Google Fonts → cache first
// - Navigation → network first, fall back to cached app shell
// - Other assets → network first, fall back to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls or admin endpoints
  if (
    url.pathname.startsWith('/analyze') ||
    url.pathname.startsWith('/barcode') ||
    url.pathname.startsWith('/cache-clear') ||
    url.pathname.startsWith('/cache-status') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/subscribe') ||
    url.pathname.startsWith('/health')
  ) {
    return; // let browser handle normally
  }

  // Cache-first for Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests — network first, fall back to app shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/'))
            .then((fallback) => fallback || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
        )
    );
    return;
  }

  // Other assets — network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || new Response('', { status: 504 }))
      )
  );
});
