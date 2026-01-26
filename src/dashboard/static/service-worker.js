/**
 * Titan Memory Dashboard Service Worker
 * Provides offline support with intelligent caching strategies:
 * - Cache-first for static assets (HTML, CSS, JS)
 * - Network-first for API requests with cache fallback
 * - Network-only for WebSocket (skip service worker)
 */

const CACHE_NAME = 'titan-memory-v1';
const STATIC_CACHE_NAME = 'titan-static-v1';
const API_CACHE_NAME = 'titan-api-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// External CDN resources to cache
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/vis-network@9.1.9/dist/vis-network.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');

  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache CDN assets (best effort)
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return Promise.allSettled(
          CDN_ASSETS.map((url) =>
            fetch(url, { mode: 'cors' })
              .then((response) => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch(() => {
                console.log(`[ServiceWorker] Failed to cache CDN asset: ${url}`);
              })
          )
        );
      })
    ]).then(() => {
      // Skip waiting to activate immediately
      self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');

  const cacheWhitelist = [STATIC_CACHE_NAME, API_CACHE_NAME];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - handle requests with appropriate strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip WebSocket requests entirely
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API requests - Network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(event.request, API_CACHE_NAME));
    return;
  }

  // CDN requests - Cache first with network fallback
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirstWithNetwork(event.request, STATIC_CACHE_NAME));
    return;
  }

  // Static assets - Cache first with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithNetwork(event.request, STATIC_CACHE_NAME));
    return;
  }

  // All other requests - Network only
  event.respondWith(fetch(event.request));
});

/**
 * Cache-first strategy with network fallback
 * Best for: Static assets (HTML, CSS, JS, images)
 */
async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);

  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Update cache in background (stale-while-revalidate)
    updateCache(request, cacheName).catch(() => {});
    return cachedResponse;
  }

  // Fall back to network
  try {
    const networkResponse = await fetch(request);
    // Cache the new response
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network request failed:', request.url);
    // Return a simple offline page for HTML requests
    if (request.headers.get('Accept')?.includes('text/html')) {
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>Offline - Titan Memory</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1>You're Offline</h1>
          <p>The Titan Memory Dashboard is not available offline.</p>
          <p>Please check your internet connection and try again.</p>
        </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    throw error;
  }
}

/**
 * Network-first strategy with cache fallback
 * Best for: API requests (want fresh data, but can work with stale)
 */
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    // Try network first
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network failed, trying cache:', request.url);

    // Fall back to cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return error response for API
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'Unable to reach the server' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Update cache in background (stale-while-revalidate)
 */
async function updateCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response);
  }
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
