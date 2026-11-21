'use strict';

// Le HTML contient toute l’application : une mise à jour de index.html suffit.
// Modifier CACHE_VERSION uniquement si la logique de ce fichier change.
const CACHE_VERSION = 'v2';
const CACHE_PREFIX = 'score-' + self.registration.scope;
const CACHE_NAME = CACHE_PREFIX + '-' + CACHE_VERSION;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const SHELL = ['./index.html', './manifest.json', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL.map(file => new Request(new URL(file, self.registration.scope), {cache:'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Seulement les fichiers web de cette application. Ne jamais toucher localStorage.
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX + '-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchFresh(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try { return await fetch(request, {cache:'no-store', signal:controller.signal}); }
  finally { clearTimeout(timeout); }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const isDocument = event.request.mode === 'navigate' || url.pathname === new URL(INDEX_URL).pathname;
  if (isDocument) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        // Réseau prioritaire : index.html modifié est récupéré à la prochaine ouverture.
        const response = await fetchFresh(event.request);
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
          // Même si le stockage est plein, afficher la version reçue du réseau.
          await cache.put(INDEX_URL, response.clone()).catch(() => {});
          return response;
        }
        return await cache.match(INDEX_URL) || response;
      } catch {
        return await cache.match(INDEX_URL) || new Response('Ouvrez SCORE Belote une première fois avec une connexion.',
          {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
  } else {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetchFresh(event.request);
        if (response.ok) { await cache.put(event.request, response.clone()).catch(() => {}); return response; }
        return await cache.match(event.request) || response;
      } catch {
        return await cache.match(event.request) || new Response('', {status:503});
      }
    })());
  }
});
