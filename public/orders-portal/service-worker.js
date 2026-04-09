const CACHE = 'dcr-orders-v4';
const ASSETS = [
  './',
  './login.html',
  './index.html',
  './css/style.css',
  './js/app.js',
  './data/catalog.seed.json'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
