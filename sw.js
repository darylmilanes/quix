// Minimal offline service worker — caches shell
const CACHE = 'quix-shell-v1';
const urlsToCache = [
  '.',
  'index.html',
  'manifest.json',
  // icons if present
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', evt=>{
  evt.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(urlsToCache)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', evt=>{
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', evt=>{
  // network-first for API-like requests? For simplicity: cache-first for app shell
  evt.respondWith(
    caches.match(evt.request).then(resp=>{
      return resp || fetch(evt.request).then(r=>{
        // optionally cache navigations
        return r;
      }).catch(()=>caches.match('.'));
    })
  );
});
