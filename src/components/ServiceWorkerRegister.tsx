"use client";

import { useEffect } from "react";
import { loadPlayerPool, loadCategories } from "@/lib/offline/players-cache";

// O registro do service worker é feito pelo <SerwistProvider> no layout.
// Este componente cuida apenas do AQUECIMENTO de cache offline:
//   • pool de jogadores + categorias (IndexedDB) → criar campeonato/desafio offline
//   • páginas principais (documento + RSC) → o Serwist as cacheia em runtime
// Assim, ao ficar offline, criar e navegar funcionam mesmo sem visita manual.
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
  // Aquece o cache de dados (pool de jogadores + categorias) a cada abertura online.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    void loadPlayerPool();
    void loadCategories();
  }, []);

  // Aquece o cache de páginas principais via runtime caching do Serwist.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then(() => {
        if (cancelled) return;
        for (const path of WARM_ROUTES) {
          fetch(path, { credentials: "same-origin" }).catch(() => {});
          fetch(path, { credentials: "same-origin", headers: { RSC: "1" } }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
