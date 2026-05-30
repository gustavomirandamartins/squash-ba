// SquashBa — service worker offline-first (navegação + assets + RSC)
//
// O app é Server-Components: offline o servidor é inalcançável, então não há
// como renderizar páginas na hora. Estratégia: cachear o que já foi renderizado
// (documentos HTML + payloads RSC do App Router) e os assets do build, para que
// TODO o caminho navegado online fique disponível offline (como snapshot).
//
//   • Assets do build (/_next/static, /icons, /brand, manifest): cache-first (SWR).
//   • Navegações (documento) e RSC (navegação client-side do Next): network-first
//     → caem no snapshot cacheado da MESMA rota → home → página offline.
//   • Rotas principais são pré-cacheadas na ativação (online) para já abrirem
//     offline mesmo sem visita manual.
//   • Demais GETs (dados Supabase): seguem à rede; offline falham e o app trata.
//
// Combinado com o motor de placar (fila offline em IndexedDB), permite: navegar
// o app, abrir um campeonato/jogo já visto e ALIMENTAR placares offline — que
// sincronizam e recalculam a classificação ao reconectar.

const VERSION = 'v4';
const STATIC_CACHE = `squashba-static-${VERSION}`;
const PAGE_CACHE = `squashba-pages-${VERSION}`;

// Rotas que valem pré-carregar (o "caminho" base do app).
const CORE_ROUTES = ['/', '/campeonatos', '/jogos', '/mensagens', '/comunidade'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purga caches de versões anteriores (inclui o "/" congelado do bug antigo).
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();

      // Pré-cache best-effort das rotas principais (estamos online ao ativar).
      const cache = await caches.open(PAGE_CACHE);
      await Promise.all(
        CORE_ROUTES.map(async (path) => {
          try {
            const res = await fetch(path, { credentials: 'same-origin' });
            if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
              await cache.put(path, res.clone());
            }
          } catch {
            /* offline / falhou — ignora */
          }
        }),
      );
    })(),
  );
});

// ── Web Push ───────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body, url } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? '/mensagens'));
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

// Network-first; offline cai no snapshot cacheado da mesma URL.
async function networkFirst(request, { isNavigation } = {}) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isNavigation) {
      const home = await cache.match('/');
      if (home) return home;
      return offlineHtml();
    }
    // RSC sem cache: 503 → o Next mostra o boundary de erro client-side.
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

function offlineHtml() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Offline</title><body style="margin:0;display:grid;place-items:center;height:100vh;' +
      'background:#16233a;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
      '<div><p style="font-size:18px;font-weight:700">Você está offline</p>' +
      '<p style="opacity:.6;font-size:14px;margin-top:8px">Abra esta tela online uma vez para que ela fique disponível offline.</p>' +
      '<button onclick="location.reload()" style="margin-top:16px;background:#cdfd51;color:#1d2b45;border:0;' +
      'border-radius:999px;padding:10px 20px;font-weight:700">Tentar de novo</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // não intercepta terceiros

  // Assets imutáveis do build → cache-first (SWR).
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // RSC (navegação client-side do App Router) → network-first c/ snapshot.
  if (request.headers.get('RSC') === '1') {
    event.respondWith(networkFirst(request, { isNavigation: false }));
    return;
  }

  // Navegação de documento (reload / hard nav) → network-first c/ snapshot.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, { isNavigation: true }));
    return;
  }

  // Demais GETs (dados Supabase/RSC de imagem): seguem à rede. Offline falham e
  // o app trata — NUNCA devolvemos HTML no lugar de dados.
});
