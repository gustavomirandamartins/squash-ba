"use client";

import { useEffect } from "react";
import { loadPlayerPool, loadCategories } from "@/lib/offline/players-cache";

// Rotas que devem abrir offline mesmo sem visita manual. Espelha CORE_ROUTES do
// service worker. Aquecidas pelo CLIENTE (não só no activate do SW), pois o
// pré-cache no activate só funciona se houver rede no exato instante da ativação
// — frágil. Aqui garantimos o cache em toda abertura online.
const WARM_ROUTES = [
  "/",
  "/campeonatos",
  "/campeonatos/novo",
  "/jogos",
  "/desafios/novo",
  "/mensagens",
  "/comunidade",
];

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* instalabilidade é best-effort nesta fase */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // Aquece o cache offline (pool de jogadores + categorias) a cada abertura
  // online, para que a criação de campeonatos/desafios offline funcione mesmo
  // que o usuário nunca tenha aberto um wizard antes.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    void loadPlayerPool();
    void loadCategories();
  }, []);

  // Aquece o cache de PÁGINAS (documento + payload RSC) das rotas principais.
  // Dispara as requisições com o SW já ativo; ele as intercepta e cacheia por
  // pathname (network-first). Assim, clicar em "Criar" offline acha o snapshot
  // — sem depender do pré-cache no activate do SW.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then(() => {
        if (cancelled) return;
        // Pequeno atraso para não competir com a renderização inicial.
        setTimeout(() => {
          if (cancelled) return;
          for (const path of WARM_ROUTES) {
            // Documento (hard nav / reload)
            fetch(path, { credentials: "same-origin" }).catch(() => {});
            // Payload RSC (navegação client-side via <Link>)
            fetch(path, {
              credentials: "same-origin",
              headers: { RSC: "1" },
            }).catch(() => {});
          }
        }, 1500);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
