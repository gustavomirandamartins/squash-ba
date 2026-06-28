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

O SquashBa foi desenhado para centralizar um esporte que vive espalhado em grupos de WhatsApp, planilhas e chaves de papel. Ele oferece:

- **Rede social & Diretório:** Um local para encontrar jogadores, treinadores (professores), ver rankings por categoria, além de se comunicar via mensagens diretas e grupos de campeonato.
- **Motor de Competições:** Crie e gerencie campeonatos com regras automatizadas, dispensando planilhas manuais. 
- **Placar Offline-first:** Quadras frequentemente não têm sinal de internet. Com o SquashBa, qualquer participante pode registrar os pontos quadra adentro sem sinal. A fila local (via IndexedDB) sincroniza com o servidor assim que a conexão volta. Os conflitos são expostos explicitamente, nunca sobrescrevendo dados de maneira silenciosa.
- **Mercado e Comunidade:** O *Marketplace* expõe profissionais e serviços locais responsáveis do ecossistema do squash.

---

## 🚀 Funcionalidades Principais

### Motor de Campeonatos e Formatos 🏆
O sistema suporta os principais formatos oficiais:
- **Liga:** Sistema de pontos corridos (todos jogam contra todos).
- **Grupos + Eliminatória:** Fase de grupos seguido de um chaveamento eliminatório (Mata-mata).
- **Eliminatória:** Chaveamento direto simples com sementes (seeds), incluindo disputa de 3º lugar.
- **Desafios (Challenges):** Confrontos 1v1, Duplas (2v2) ou Times (N-vs-N) em disputas de "Melhor de N" com fluxo prático de envio e aceite de convites.

Configurações avançadas incluem partidas cronometradas, Melhor de 3/5, controle de "vai a dois" (win-by-two) e desempates dinâmicos configuráveis.

### Placar "Zero Atrito" e Offline-First 📵
Qualquer pessoa envolvida em uma partida tem acesso às funções de gestão daquele jogo: 
- Contabilizar pontos e encerrar o jogo em andamento.
- Declarar W.O. ou desclassificações.
Tudo isso amparado por Row-Level Security (RLS) para prevenir que dados sejam falsificados. Criar campeonatos, desafiar pessoas e alterar placares funcionam mesmo 100% offline.

### Design System: Glassmorphism e Cores 🎨
O UI utiliza CSS moderno focado em `backdrop-filter` e otimização de `paint` (Tailwind CSS v4 utilizando `@theme` nativo).

| Token / Cor | Valor | Uso |
|-------------|-------|-----|
| `--color-primary` | `#1d2b45` (Navy) | Fundo base |
| `--color-secondary` | `#cdfd51` (Neon) | Acento, Call to Action, Aba ativa |
| `--color-cane` | `#8bc34a` (Verde Cana) | Campeonatos oficiais |
| `--color-surface` | `#2c3b58` | Cards e backgrounds secundários |
| `--color-neutral` | `#3c4b66` | Bordas |

Estilos em destaque:
- `glass`, `glass-card`, e `glass-pill` baseados em sombras e reflexos polidos (sheen).
- Animações CSS: `reveal`, `fade-in`, e `live-dot` otimizadas e respeitando acessibilidade (`prefers-reduced-motion`).

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|--------|-----------|----------|
| **Framework** | **Next.js 16** | App Router, Server Components, Server Actions |
| **Linguagem** | **TypeScript** | Fortemente tipado, rodando com **React 19** |
| **Estilo** | **Tailwind CSS v4** | Configuração via `@theme` + Utilitários Glass customizados em CSS puro |
| **Backend** | **Supabase** | PostgreSQL, Autenticação, Row-Level Security (RLS), Storage, Realtime |
| **Offline Sync** | **IndexedDB** | Baseado em `idb-keyval` com sistema *outbox* + Service Worker **Serwist** |
| **PWA** | Manifest & SW | Instalável, standalone, notificações web push e navegação pré-cache |
| **Fontes & Ícones** | Sora e Inter | Display (Sora), Corpo de texto (Inter) e `lucide-react` para iconografia |
| **Hospedagem** | **Vercel** | Edge network para Server Components |

---

## 👥 Papéis de Usuário e LGPD

Garantimos a segurança (via RLS no PostgreSQL) e o cumprimento de LGPD (como exclusão de conta, isolamento de dados privados, e controle sobre termo de responsabilidade de menores de idade):

1. **Jogador (Player):** Papel padrão. Preenche o perfil, participa de jogos e competições, atualiza os placares dos seus próprios jogos, cria desafios e interage na rede.
2. **Organizador ("Professor"):** Pode gerir e criar campeonatos completos, gerenciar times/categorias, administrar regras e resultados de jogos dentro das suas competições, e listagem no diretório de profissionais.
3. **Admin:** Operador geral, que aprova organizadores, edita regras sistêmicas de anúncios do marketplace, avalia feedbacks e possui total controle sobre a integridade e moderação da plataforma.

*Nota:* Independente de seu nível de hierarquia, qualquer usuário tem os direitos de edição **apenas nas partidas ativas de que faz parte**.

---

## 💻 Rodar Localmente

Certifique-se de ter o Node.js v20+ instalado.

```bash
# 1. Instale as dependências
npm install

# 2. Rode o servidor de desenvolvimento
npm run dev
# Estará rodando em: http://localhost:3000

# (Opcional) Gerar build de produção local
npm run build
```

### Variáveis de Ambiente

Crie o arquivo `.env.local` na raiz do projeto com as chaves do seu projeto **Supabase**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SECRET_KEY=<service-role-key>   # Usado para ações de servidor restritas (ex: exclusão de conta LGPD)
```

As migrações do banco ficam na pasta `supabase/migrations/` e podem ser aplicadas diretamente via `supabase db push` utilizando a CLI do Supabase.

---

## 📂 Estrutura de Diretórios

```text
src/
  app/
    layout.tsx                  # Estrutura base, fonte, PWA manifest e Service Worker
    globals.css                 # Tokens @theme do Tailwind + utilitários glass
    sw.ts                       # Entry point do service worker (Serwist)
    login/ & onboarding/        # Fluxo de autenticação, LGPD e cadastro inicial
    (app)/                      # Shell logado da aplicação (TopBar + BottomNav + Sync Engine)
      page.tsx                  # Home: Ao vivo, Rankings, Lembretes
      campeonatos/              # Sistema de torneios, brackets, chaves, pontuação
      desafios/                 # Gestão de confronto direto 1v1 e duplas
      comunidade/               # Diretório de jogadores
      mensagens/                # Motor de Chat Realtime 1:1 e grupos
      pendentes/[tempId]/       # Itens aguardando sincronização offline (Outbox local)
  components/
    score/                      # Interface de Placar e lógica (ScoreScreen / LocalScoreScreen)
    campeonatos/                # Tabelas, Brackets, Cards e Wizard de criação
    offline/                    # Componentes baseados em IndexedDB e Provisional State
  lib/
    score-engine/               # Lógica de validação do placar, sets e vitórias (Online & Offline)
    offline/                    # Sync outbox e local-championship mirror
    standings/                  # Motor que espelha os cálculos RPC de tiebreakers
supabase/
  migrations/                   # Histórico SQL completo das tabelas, RPCs, e políticas RLS
```

---

## 🚀 Deploy

O projeto está otimizado para deploy imediato na **Vercel**. Configure as variáveis de ambiente acima no painel do projeto:

```bash
npm i -g vercel

# Deploy preview de desenvolvimento
vercel

# Deploy de Produção
vercel --prod
```
