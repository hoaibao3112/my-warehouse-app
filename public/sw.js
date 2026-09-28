importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

const OFFLINE_URL = '/offline.html';

if (workbox) {
    console.log(`Yay! Workbox is loaded 🎉`);

    // Precache offline page
    self.addEventListener('install', (event) => {
        event.waitUntil(
            caches.open('offline-cache').then((cache) => cache.add(OFFLINE_URL))
        );
    });

    // Cleanup old caches
    self.addEventListener('activate', (event) => {
        event.waitUntil(
            caches.keys().then((keyList) =>
                Promise.all(
                    keyList.map((key) => {
                        if (key !== 'offline-cache' && !key.startsWith('workbox-')) {
                            return caches.delete(key);
                        }
                    })
                )
            )
        );
    });

    // Cache HTML (App Shell)
    workbox.routing.registerRoute(
        ({ request }) => request.destination === 'document',
        new workbox.strategies.NetworkFirst({
            cacheName: 'documents',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 10,
                    maxAgeSeconds: 24 * 60 * 60, // 24 hours
                }),
            ],
        })
    );

    // Cache JS and CSS
    workbox.routing.registerRoute(
        ({ request }) => request.destination === 'script' || request.destination === 'style',
        new workbox.strategies.StaleWhileRevalidate({
            cacheName: 'static-resources',
        })
    );

    // Cache Images
    workbox.routing.registerRoute(
        ({ request }) => request.destination === 'image',
        new workbox.strategies.CacheFirst({
            cacheName: 'images',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 50,
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                }),
            ],
        })
    );

    // Catch handler for offline fallback
    workbox.routing.setCatchHandler(async ({ event }) => {
        if (event.request.destination === 'document') {
            return caches.match(OFFLINE_URL);
        }
        return Response.error();
    });
} else {
    console.log(`Boo! Workbox didn't load 😬`);
}
