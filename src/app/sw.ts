/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ── Regras próprias (vêm ANTES do defaultCache; a primeira que casa vence) ────
//
// Páginas e payloads RSC: "rede primeiro", mas com PRAZO. O defaultCache não
// tem timeout para páginas — com sinal fraco na quadra, cada navegação esperava
// a rede desistir antes de usar a cópia guardada. Após 3 s sem resposta, usa o
// cache (se houver; senão continua esperando a rede). Limites maiores que os 32
// do default, que descartavam na hora parte das rotas pré-carregadas.
//
// Supabase: dados (REST, Auth, Realtime, Functions) NUNCA vão para o cache — o
// default "cross-origin" copiava e gravava cada resposta (inclusive dados
// pessoais) sem nunca usá-las. Imagens públicas do Storage ficam em cache.
const NETWORK_TIMEOUT_S = 3;
const pageExpiration = () =>
  new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 7 * 24 * 60 * 60 });

const isSupabase = (url: URL) => url.hostname.endsWith(".supabase.co");

const appCaching: RuntimeCaching[] = [
  {
    matcher: ({ url }) => isSupabase(url) && url.pathname.startsWith("/storage/v1/object/public/"),
    handler: new StaleWhileRevalidate({
      cacheName: "supabase-public-images",
      plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ url }) => isSupabase(url),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin &&
      !url.pathname.startsWith("/api/") &&
      request.headers.get("RSC") === "1" &&
      request.headers.get("Next-Router-Prefetch") === "1",
    handler: new NetworkFirst({
      cacheName: "pages-rsc-prefetch",
      networkTimeoutSeconds: NETWORK_TIMEOUT_S,
      plugins: [pageExpiration()],
    }),
  },
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin && !url.pathname.startsWith("/api/") && request.headers.get("RSC") === "1",
    handler: new NetworkFirst({
      cacheName: "pages-rsc",
      networkTimeoutSeconds: NETWORK_TIMEOUT_S,
      plugins: [pageExpiration()],
    }),
  },
  {
    // Documentos: navegações e as buscas da pré-carga offline (mesma URL).
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/_next/") &&
      (request.mode === "navigate" || request.headers.get("Accept")?.includes("text/html") === true ||
        (request.destination === "" && !url.pathname.includes("."))),
    handler: new NetworkFirst({
      cacheName: "pages",
      networkTimeoutSeconds: NETWORK_TIMEOUT_S,
      plugins: [pageExpiration()],
    }),
  },
];

const serwist = new Serwist({
  // Precache de TODO o build (chunks JS, CSS, páginas estáticas) + /~offline.
  // É isto que faltava no SW artesanal: as páginas cacheadas agora têm seus
  // chunks disponíveis offline e hidratam corretamente.
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // defaultCache trata corretamente RSC (?_rsc / header RSC), navegações e
  // assets do Next App Router — sem o casamento de cache frágil do SW anterior.
  runtimeCaching: [...appCaching, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ── Web Push (preservado do SW anterior) ─────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, url } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? "/mensagens"));
});
