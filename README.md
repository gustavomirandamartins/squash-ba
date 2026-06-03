# SquashBa

A casa digital da comunidade de squash da Bahia — rede social, plataforma de campeonatos e placar offline-first em um único PWA mobile-first.

> Documentação completa do produto: [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md)

---

## O que é

- **Rede social** — diretório de jogadores e professores, rankings por categoria, mensagens diretas e grupos de campeonato.
- **Motor de competições** — crie e gerencie campeonatos nos formatos Liga, Grupos + Eliminatória, Eliminatória e Desafio (1v1, duplas ou times), com chaves e tabelas geradas automaticamente.
- **Placar offline-first** — registre pontos quadra adentro sem sinal; a fila local sincroniza ao voltar online. Conflitos são expostos explicitamente, nunca sobrescritos em silêncio.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | **Next.js 16** — App Router, Server Components, Server Actions |
| Linguagem | TypeScript · React 19 |
| Estilo | **Tailwind CSS v4** (tokens via `@theme`) + glassmorphism customizado |
| Backend | **Supabase** — PostgreSQL, RLS, Auth, Storage, Realtime |
| Offline | **IndexedDB** (`idb-keyval`) + sync engine próprio · **Serwist** service worker |
| PWA | Manifest, service worker, instalável, standalone, web push |
| Fontes / Ícones | Sora (display) · Inter (corpo) · lucide-react |
| Hospedagem | **Vercel** |

---

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de produção
```

### Variáveis de ambiente

Crie `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SECRET_KEY=<service-role-key>   # usado apenas em server actions (exclusão de usuário)
```

As migrações ficam em `supabase/migrations/` e podem ser aplicadas via `supabase db push` ou pelo dashboard do Supabase.

---

## Estrutura

```
src/
  app/
    layout.tsx                  # fonte, metadata, registro do SW
    globals.css                 # tokens @theme + utilitários glass + animações
    manifest.ts                 # PWA manifest
    sw.ts                       # entry point do service worker (Serwist)
    login/                      # autenticação
    onboarding/                 # cadastro inicial obrigatório
    perfil/                     # edição de perfil e senha
    admin/                      # painel admin (abas: usuários, professores, anúncios, banners, feedbacks)
    auth/                       # callback OAuth e redefinição de senha
    (app)/                      # shell autenticado (TopBar + BottomNav + OfflineSync)
      page.tsx                  # Início — lembretes, ao vivo, rankings, professores
      campeonatos/              # listagem, criação (wizard), detalhe, bracket, placar
      desafios/                 # criação (wizard), detalhe, placar
      comunidade/               # diretório de jogadores filtrado por categoria
      marketplace/              # professores e anúncios de produtos/serviços
      mensagens/                # conversas diretas e grupos de campeonato
      gestao/                   # categorias, locais e times (organizadores/admins)
      ajuda/                    # envio de feedback
      versao/                   # changelog gerado a partir do histórico git
      pendentes/[tempId]/       # item criado offline aguardando sync
  components/
    score/                      # ScoreScreen (online) · LocalScoreScreen (offline)
    campeonatos/                # wizard, bracket, grupos, standings, stats
    desafios/                   # wizard, detalhe 1v1 e times
    offline/                    # OfflineSync, PendingList, ProvisionalChampionship…
    admin/                      # AdminUsers, AdminNav
    home/                       # seções da página inicial
    mensagens/                  # ChatView, ConversationList
    gestao/                     # listas de categorias, locais, times
  lib/
    score-engine/               # useScoreEngine (online) · useLocalScoreEngine (offline)
    offline/                    # outbox, champ-cache, reconcile, local-championship
    standings/                  # compute.ts — espelha get_standings do servidor
supabase/
  migrations/                   # histórico completo de migrações SQL
```

---

## Design system

Tokens principais (`src/app/globals.css`):

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-primary` | `#1d2b45` | Fundo base (azul-marinho) |
| `--color-secondary` | `#cdfd51` | Acento neon — CTAs, aba ativa |
| `--color-surface` | `#2c3b58` | Cards |
| `--color-neutral` | `#3c4b66` | Bordas / surfaces secundárias |
| `--font-display` | Sora | Títulos |
| `--font-sans` | Inter | Corpo |

Utilitários glass: `.glass` (tint + borda + sombra), `.glass-card` (raio 24 px), `.glass-pill` (raio 999 px), `.glass-overlay` (blur — apenas em overlays reais como o BottomNav). Animações CSS-only: `.reveal`, `.fade-in`, `.live-dot` — todas respeitam `prefers-reduced-motion`.

---

## Papéis de usuário

| Papel | Quem | O que pode |
|-------|------|-----------|
| **Jogador** (padrão) | Qualquer cadastrado | Preencher perfil, participar de competições, registrar placar dos próprios jogos, criar desafios, enviar mensagens. |
| **Organizador** | Aprovado por admin | Criar e gerir campeonatos em todos os formatos, gerir categorias/locais/times, decretar W.O., finalizar/reabrir qualquer partida. |
| **Admin** | Operadores | Tudo — aprovação de organizadores, gestão de usuários, anúncios, banners e feedbacks. |

Participantes de uma partida ganham direitos de gestão **escopo ao seu jogo** independentemente do papel global.

---

## Deploy na Vercel

O projeto é detectado automaticamente como Next.js. Configure as três variáveis de ambiente acima no painel do projeto e conecte o repositório:

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # produção
```
