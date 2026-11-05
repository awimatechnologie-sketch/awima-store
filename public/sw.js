// Service Worker لموقع AWIMA Store.
// - الصفحات: الشبكة أولاً (الأسعار والمخزون تتغير)، وعند انقطاع الإنترنت آخر نسخة زارها الزبون ثم صفحة offline.html.
// - الملفات الثابتة (/_astro و/images و/icons): من الذاكرة أولاً مع تحديث في الخلفية.
// - لا نعترض: لوحة الإدارة، الطلبات غير GET، المواقع الأخرى (واتساب، الإحصائيات).
// غيّر VERSION عند أي تعديل على هذا الملف ليُمسح الكاش القديم.
const VERSION = 'v1';
const PAGES = `awima-pages-${VERSION}`;
const ASSETS = `awima-assets-${VERSION}`;
const PRECACHE = ['/offline.html', '/', '/products'];
const MAX_PAGES = 60;
const MAX_ASSETS = 200;

const isAsset = (p) => p.startsWith('/_astro/') || p.startsWith('/images/') || p.startsWith('/icons/');
const skip = (p) => p.startsWith('/admin') || p.startsWith('/cdn-cgi/') || p === '/sw.js' || p === '/sitemap.xml' || p === '/robots.txt';

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('awima-') && n !== PAGES && n !== ASSETS).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || skip(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy)).then(() => trim(PAGES, MAX_PAGES));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('/offline.html')) || Response.error())
    );
    return;
  }

  if (isAsset(url.pathname)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              cache.put(req, res.clone()).then(() => trim(ASSETS, MAX_ASSETS));
            }
            return res;
          })
          .catch(() => hit || Response.error());
        return hit || network;
      })
    );
  }
});
