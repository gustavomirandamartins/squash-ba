// SquashBa — service worker (offline-capable, sempre a versão atual)
//
// Histórico do bug: a versão anterior pré-cacheava "/" num cache de nome fixo
// (nunca atualizado) e, no `fetch`, fazia fallback de QUALQUER requisição para
// caches.match("/"). Offline, os bundles JS (hashed, não cacheados) recebiam o
// HTML antigo de "/" → o app não hidratava e exibia um shell quebrado/antigo.
//
// Estratégia atual:
//   • Bump de versão → purga os caches antigos (inclui o "/" congelado).
//   • Assets do build (/_next/static, ícones, brand): stale-while-revalidate.
//   • Navegações (HTML): network-first → cai na página cacheada (atual) → "/".
//   • Demais GETs (RSC/dados): vão à rede e falham naturalmente offline
//     (NUNCA recebem HTML no lugar — o app trata o erro).

const VERSION = 'v3';
const STATIC_CACHE = `squashba-static-${VERSION}`;
const PAGE_CACHE = `squashba-pages-${VERSION}`;

self.addEventListener('install', () => {
  // Ativa imediatamente a nova versão.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
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

// Cache-first com revalidação em background (assets imutáveis do build).
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

// Network-first para navegações; offline cai na página cacheada (ou "/").
async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const home = await cache.match('/');
    if (home) return home;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Offline</title><body style="margin:0;display:grid;place-items:center;height:100vh;' +
        'background:#16233a;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
        '<div><p style="font-size:18px;font-weight:700">Você está offline</p>' +
        '<p style="opacity:.6;font-size:14px;margin-top:8px">Reconecte para continuar usando o SquashBa.</p></div>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // não intercepta terceiros

  // Assets imutáveis do build → cache-first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Navegação de documento (reload / hard nav) → network-first com fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  // Demais GETs (RSC, dados Supabase): deixa o navegador seguir à rede.
  // Offline eles falham naturalmente e o app trata — NUNCA devolvemos HTML aqui.
});
