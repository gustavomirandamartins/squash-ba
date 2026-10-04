# SquashBa 🎾

![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19.2.4-blue?style=for-the-badge&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)
![Supabase](https://img.shields.io/badge/Supabase-DB_&_Auth-3ECF8E?style=for-the-badge&logo=supabase)
![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?style=for-the-badge&logo=pwa)

A casa digital da comunidade de squash da Bahia — rede social, plataforma de campeonatos e placar *offline-first* em um único PWA mobile-first.

> 📘 **Documentação completa do produto:** [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md)

---

## 🌟 O que é o SquashBa

O SquashBa centraliza um esporte que vive espalhado em grupos de WhatsApp, planilhas e chaves de papel:

- **Rede social e diretório:** feed da comunidade (posts, curtidas, comentários), diretório de jogadores e professores, ranking geral e por categoria, mensagens diretas e grupos de campeonato.
- **Motor de competições:** campeonatos com geração de jogos, resultados, chaveamento e encerramento automáticos — sem planilhas.
- **Placar offline-first:** quadras costumam não ter sinal. Qualquer participante registra os pontos sem internet; a fila local (IndexedDB) sincroniza quando a conexão volta, e conflitos são expostos para revisão, nunca sobrescritos em silêncio.
- **Marketplace:** professores disponíveis para aulas e anúncios de produtos e serviços do ecossistema do squash.

---

## 🚀 Funcionalidades Principais

### Motor de Campeonatos 🏆

| Formato | Como funciona |
|---------|---------------|
| **Liga** | Todos contra todos (round-robin), 1 ou mais turnos, com alternância de lados entre rodadas. |
| **Eliminatórias** | Chave ATP com seeds, byes automáticos e disputa de 3º lugar opcional. Com 3 inscritos vira triangular. |
| **Grupos + Eliminatórias** | Round-robin por grupo (distribuição por snake draft, ajustável à mão). Ao fim dos grupos, a chave é gerada sozinha com cruzamento entre grupos (1º de um × último classificado do outro). O organizador pode trocar confrontos da 1ª rodada antes de a chave começar. |
| **Desafios** | 1v1 com convite e aceite, duplas (2v2) ou times (NxN) com final opcional entre o melhor de cada time. |

- **Contagem por sets** (melhor de 1, 3 ou 5; pontos por set; vantagem de 2 opcional; empate de set opcional) ou **por tempo** (cronômetro).
- **Pontuação e desempates configuráveis** (sets ganhos, pontos ganhos, menos pontos sofridos), com classificação, estatísticas e pódio.
- **Campeonatos oficiais:** criados por professor/admin, com descrição, local e período; inscrição solicitada pelo jogador e aprovada pelo organizador; notificação a todos os usuários na abertura e no início.
- **Ranking global:** 2 pts por vitória e 1 por derrota/empate, mais bônus de colocação (1º/2º/3º = 5/3/1 em campeonatos comuns; 15/10/5 + 5 de participação em oficiais).

Quase tudo roda em triggers do Postgres: ao **ativar**, os jogos são gerados e o grupo de conversa é criado; a cada **ponto**, o resultado é recalculado; a cada **jogo finalizado**, a chave avança; quando **não sobra jogo pendente**, o campeonato encerra.

### Placar "Zero Atrito" e Offline-First 📵
Organizador e participantes de uma partida podem:
- Lançar pontos, encerrar a partida e agendar data/hora.
- Declarar W.O. (vitória sem sets/pontos) ou desclassificação (anula o placar parcial).
- Excluir os dados da partida para relançar do zero.

O organizador também pode reabrir partidas finalizadas e resolver conflitos de placar. Tudo é protegido por Row-Level Security (RLS). Criar campeonatos e desafios, jogar e lançar placares funcionam 100% offline depois do primeiro acesso online.

### Gestão e Painel Admin 🛠
- **Gestão** (professor/admin): jogadores (troca de categoria), categorias, locais e times.
- **Painel admin** (`/admin`): usuários (conceder/remover professor, excluir conta), solicitações de professor, anúncios, banners de patrocinadores e feedbacks.

### Design System: Glassmorphism e Cores 🎨
O UI utiliza CSS moderno focado em `backdrop-filter` e otimização de `paint` (Tailwind CSS v4 utilizando `@theme` nativo).

| Token / Cor | Valor | Uso |
|-------------|-------|-----|
| `--color-primary` | `#1d2b45` (Navy) | Fundo base |
| `--color-secondary` | `#cdfd51` (Neon) | Acento, Call to Action, aba ativa, ícones de título |
| `--color-cane` | `#8bc34a` (Verde Cana) | Campeonatos oficiais |
| `--color-surface` | `#2c3b58` | Cards e backgrounds secundários |
| `--color-neutral` | `#3c4b66` | Bordas |

Estilos em destaque:
- `glass`, `glass-card` e `glass-pill` baseados em sombras e reflexos polidos (sheen).
- Títulos de página no padrão ícone verde (`text-secondary`) + título em `font-display text-lg font-bold`.
- Animações CSS: `reveal`, `fade-in` e `live-dot`, respeitando `prefers-reduced-motion`.

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|--------|-----------|----------|
| **Framework** | **Next.js 16** | App Router, Server Components, Server Actions |
| **Linguagem** | **TypeScript** | Fortemente tipado, rodando com **React 19** |
| **Estilo** | **Tailwind CSS v4** | Configuração via `@theme` + utilitários glass em CSS puro |
| **Backend** | **Supabase** | PostgreSQL (RPCs e triggers do motor), Auth, RLS, Storage, Realtime, Edge Functions (push) |
| **Offline Sync** | **IndexedDB** | `idb-keyval` com sistema *outbox* + Service Worker **Serwist** |
| **PWA** | Manifest & SW | Instalável, standalone, notificações web push e navegação pré-cacheada |
| **Fontes & Ícones** | Sora e Inter | Display (Sora), corpo de texto (Inter) e `lucide-react` |
| **Hospedagem** | **Vercel** | Deploy + cron diário `/api/keep-alive` |

---

## 👥 Papéis de Usuário e LGPD

Segurança via RLS no PostgreSQL e cumprimento da LGPD (exclusão de conta, isolamento de dados privados, termo de responsabilidade para menores):

1. **Jogador:** papel padrão. Preenche o perfil, participa de competições, lança placar dos próprios jogos, cria desafios, solicita inscrição em campeonatos oficiais e interage na rede.
2. **Professor (organizador):** cria campeonatos (inclusive oficiais), gerencia campeonatos, jogadores, categorias, locais e times, e aparece no Marketplace.
3. **Admin:** tudo do professor, mais o painel admin (professores, usuários, anúncios, banners, feedbacks).

*Nota:* qualquer campeonato pode ser gerenciado pelo seu criador **ou por qualquer professor/admin**. Jogadores comuns só alteram partidas de que participam.

---

## 💻 Rodar Localmente

Requer Node.js v20+.

```bash
# 1. Instale as dependências
npm install

# 2. Rode o servidor de desenvolvimento (gera o changelog antes)
npm run dev
# http://localhost:3000

# (Opcional) Build de produção local
npm run build
```

### Variáveis de Ambiente

Crie `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<secret-key>              # Só no servidor: ações restritas (ex.: exclusão de conta)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid-public>   # Web push
CRON_SECRET=<segredo>                         # Protege /api/keep-alive
```

`NEXT_PUBLIC_VERSION` é gerada automaticamente pelo `next.config.ts`. As Edge Functions de push (`supabase/functions/notify-push` e `send-push`) usam `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` configuradas como secrets no Supabase.

As migrações ficam em `supabase/migrations/` e podem ser aplicadas com `supabase db push`.

---

## 📂 Estrutura de Diretórios

```text
src/
  app/
    layout.tsx                  # Base: fontes, manifest PWA e Service Worker
    globals.css                 # Tokens @theme do Tailwind + utilitários glass
    sw.ts                       # Entry point do service worker (Serwist)
    ~offline/                   # Shell offline pré-cacheado
    login/ & onboarding/        # Autenticação, LGPD e cadastro inicial
    perfil/                     # Editar perfil, senha e exclusão de conta
    admin/                      # Painel admin (usuários, professores, anúncios, banners, feedbacks)
    api/                        # Exclusão de conta e cron keep-alive
    (app)/                      # Shell logado (TopBar/BottomNav no mobile, sidebar no desktop)
      page.tsx                  # Home: ao vivo, ranking, feed da comunidade
      campeonatos/              # Criação, detalhe, chave, grupos, placar e ações do motor
      desafios/                 # Desafios 1v1, duplas e times
      gestao/                   # Jogadores, categorias, locais e times
      comunidade/ & jogador/    # Diretório e perfil público de jogadores
      marketplace/              # Professores e anúncios
      mensagens/                # Chat realtime 1:1 e grupos
      ajuda/ & versao/          # Instruções, termos, feedback e changelog
      pendentes/[tempId]/       # Campeonatos criados offline aguardando sincronização
  components/
    campeonatos/                # Wizard, detalhe, chave, grupos, classificação, painel oficial
    score/                      # Tela de placar (online e local)
    offline/                    # Sync, pré-carga e campeonato provisório
    gestao/ & admin/            # Telas de gestão e administração
  lib/
    score-engine/               # Motor de placar e fila de sincronização
    offline/                    # Outbox, caches e espelho local dos geradores do servidor
    standings/                  # Classificação offline ao vivo
supabase/
  migrations/                   # Tabelas, RPCs, triggers e políticas RLS
  functions/                    # Edge Functions de web push
```

---

## 🚀 Deploy

Otimizado para a **Vercel**. Configure as variáveis de ambiente acima no painel do projeto:

```bash
npm i -g vercel

# Preview
vercel

# Produção
vercel --prod
```
