const CACHE_NAME = 'modular-absenteismo-v2'; // Mude v2 para v3, v4... para forçar limpeza total se necessário
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  // Adicione seus ícones aqui se já existirem:
  // './icon-192.png',
  // './icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0'
];

// 1. Instalação: Cache inicial
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Força o SW a ativar imediatamente, sem esperar fechar a aba
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Ativação: Limpeza de caches antigos
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
  self.clients.claim(); // Garante controle imediato sobre todas as abas
});

// 3. Fetch: Estratégia NETWORK FIRST (Rede Primeiro)
// Tenta pegar o mais recente da rede. Se der erro (offline), pega do cache.
self.addEventListener('fetch', (event) => {
  // Ignora requisições não-HTTP (ex: chrome-extension)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se a rede respondeu, atualizamos o cache com essa versão nova
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Se a rede falhar (offline), entregamos o cache
        console.log('[SW] Offline: Servindo do cache', event.request.url);
        return caches.match(event.request);
      })
  );
});