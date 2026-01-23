const CACHE_NAME = 'modular-absenteismo-v6'; // Versão incrementada para forçar atualização
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  // Se tiver as imagens dos ícones, descomente abaixo:
  // './icon-192.png',
  // './icon-512.png',
  
  // Bibliotecas externas (CDN) essenciais
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

// 1. Instalação: Cache inicial
self.addEventListener('install', (event) => {
  // Força o Service Worker a entrar em ação imediatamente, sem esperar o usuário fechar a aba
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando arquivos essenciais');
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
  // Garante controle imediato sobre todas as abas abertas
  self.clients.claim();
});

// 3. Fetch: Estratégia NETWORK FIRST (Rede Primeiro)
self.addEventListener('fetch', (event) => {
  
  // REGRA DE SEGURANÇA:
  // Ignora requisições POST (envio de dados para o Firebase).
  // O Service Worker só deve cachear leituras (GET). Se tentar cachear POST, dá erro.
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignora requisições que não sejam http/https (ex: chrome-extension://)
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // SUCESSO DA REDE:
        // Se a internet funcionou, clonamos a resposta e atualizamos o cache
        // para garantir que a versão offline seja sempre a mais recente possível.
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // FALHA DA REDE (OFFLINE):
        // Se não tem internet, entregamos o que está guardado no cache.
        console.log('[SW] Offline: Servindo do cache', event.request.url);
        return caches.match(event.request);
      })
  );
});

