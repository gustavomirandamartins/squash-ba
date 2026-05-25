# SquashBa

Rede social mobile-first para a comunidade de **Squash da Bahia**.
**Fase 1:** app shell navegável, design system e telas com dados 100% mockados — sem backend.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 (tokens via `@theme`)
- PWA (manifest + service worker básico — apenas instalabilidade nesta fase)
- Fontes: Sora (display) + Inter (corpo)
- Ícones: lucide-react

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de produção
```

## Estrutura

```
src/
  app/
    layout.tsx            # fontes, metadata/viewport, registro do SW
    manifest.ts           # PWA manifest (rota /manifest.webmanifest)
    globals.css           # tokens @theme + utilitários glass + animações
    (app)/                # grupo do app shell (moldura 480px)
      layout.tsx          # TopBar + BottomNav fixos
      page.tsx            # Início (pills, stories, hero, feed)
      campeonatos/        # placeholder "Em construção"
      jogos/              # placeholder "Em construção"
      comunidade/         # placeholder "Em construção"
  components/             # Logo, GlassCard*, Pill, StoriesRow, MatchHeroCard,
                          # FeedCard, TopBar, BottomNav, ComingSoon, SquashImage…
  lib/mock/              # dados mockados tipados (stories, partida, feed)
public/
  icons/                 # ícones PWA (svg + png 192/512 + maskable)
  brand/                 # slot para a logo .AVIF do cliente
  sw.js                  # service worker mínimo
```

## Design system

Tokens (em `src/app/globals.css`):

| Token            | Valor     | Uso                          |
| ---------------- | --------- | ---------------------------- |
| `--color-primary`   | `#1d2b45` | fundo base (azul-marinho)    |
| `--color-secondary` | `#cdfd51` | acento neon / CTA / pill ativa |
| `--color-surface`   | `#2c3b58` | cards                        |
| `--color-neutral`   | `#3c4b66` | bordas / surfaces secundárias |
| `--color-fg`        | `#ffffff` | texto (variações por opacidade) |

Utilitários glass reutilizáveis: `.glass`, `.glass-strong`, `.glass-card` (raio 24px), `.glass-pill` (raio 999px), `.ring-neon`. Animações CSS-only: `.reveal`, `.fade-in`, `.live-dot` (respeitam `prefers-reduced-motion`).

## Logo

A marca definitiva (`.AVIF`) vai em `public/brand/logo.avif`. Enquanto isso, `src/components/Logo.tsx` usa um logomark provisório (raquete + bola em neon). Para trocar, substitua o SVG por `<Image src="/brand/logo.avif" />`.

## Deploy na Vercel

1. Suba o repositório para o GitHub/GitLab/Bitbucket.
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório — o framework Next.js é detectado automaticamente, sem configuração.
3. Ou via CLI:

   ```bash
   npm i -g vercel
   vercel          # preview
   vercel --prod   # produção
   ```

Sem variáveis de ambiente nesta fase.

## Fora de escopo (Fase 1)

Backend, Supabase, auth, banco, lógica de negócio e **sync offline** (criação/alimentação de placares de campeonatos, atualização automática das tabelas e visualização) ficam para a fase de backend.
