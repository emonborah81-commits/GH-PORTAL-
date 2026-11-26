// Basic service worker. Cache only the shell files; data/auth requests are not cached.
const CACHE_NAME = 'green-house-shell-v1';
const SHELL = ['./', './index.html', './manifest.json', './privacy.html', './favicon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.destination === 'document') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
  }
});
