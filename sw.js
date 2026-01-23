const CACHE_NAME = 'modular-absenteismo-v3'; // Subi versão para forçar atualização
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  // './icon-192.png', // Descomente se já tiver as imagens
  // './icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0'
];

// 1. Instalação
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Ativação
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch (CORRIGIDO)
self.addEventListener('fetch', (event) => {
  // CORREÇÃO: Ignora requisições que não sejam GET (como os POST do Firebase)
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignora requisições não-HTTP
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se a rede respondeu, atualiza o cache
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Se der erro (offline), tenta pegar do cache
        return caches.match(event.request);
      })
  );
});
