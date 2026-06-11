/**
 * Service worker Bovo — stratégie network-first avec fallback cache.
 * Cache les assets statiques (CSS, fonts, icônes) pour offline.
 */
const VERSION = 'bovo-v3';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Bypass pour Supabase API, Kkiapay, etc.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first pour les pages HTML, avec fallback page offline dédiée.
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || caches.match(OFFLINE_URL) || caches.match('/')
          )
        )
    );
    return;
  }

  // Assets /_astro/* : hashés donc immuables → cache-first (jamais périmés).
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // Autres assets non hashés (icônes, manifest, favicon, offline) :
  // stale-while-revalidate → réponse instantanée depuis le cache, mais mise à
  // jour en arrière-plan pour ne pas servir du périmé indéfiniment après un déploiement.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
