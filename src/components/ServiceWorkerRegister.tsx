"use client";

import { useEffect } from "react";
import { loadPlayerPool, loadCategories } from "@/lib/offline/players-cache";

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

  return null;
}
