# Visual

Fontes: `src/app/globals.css` (tokens do Tailwind v4 em `@theme`), `src/app/layout.tsx`,
`src/app/manifest.ts` e os componentes de navegação. O app só tem tema escuro
(`color-scheme: dark`).

## Cores

| Token | Valor | Uso |
|---|---|---|
| `--color-primary` | `#1d2b45` | azul-marinho base; texto sobre o neon; fundo do login e do onboarding |
| `--color-primary-700` | `#16233a` | azul mais escuro (profundidade) |
| `--color-primary-300` | `#2a3d61` | azul mais claro (gradientes) |
| `--color-secondary` | `#cdfd51` | **neon**: CTA, aba ativa, badges, destaques, seleção de texto |
| `--color-secondary-dim` | `#a9d62f` | neon apagado (anel dos stories) |
| `--color-cane` | `#8bc34a` | verde-cana: campeonatos **oficiais** |
| `--color-surface` | `#2c3b58` | cards |
| `--color-neutral` | `#3c4b66` | bordas e superfícies secundárias |
| `--color-fg` | `#ffffff` | texto base |

Fundos:

- `html`: `#2c364b`. É a cor da barra de status do iOS (web app instalado) e do
  `theme_color`.
- Corpo: degradê fixo `linear-gradient(180deg, #2a364d 0%, #192339 100%)`.
- Login, onboarding e aceite dos termos: `radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)`,
  com um brilho neon desfocado no topo (círculo `#cdfd51`, opacidade 20%, `blur-3xl`).

Texto: branco com opacidade. Os níveis mais usados são 80%, 70%, 60%, 50%, 40%, 35%, 30% e
25%. Títulos em branco cheio; rótulos de seção em maiúsculas,
`text-[11px] font-semibold uppercase tracking-widest text-white/40`.

Erro: `bg-red-500/10` com `text-red-400`, em caixa `rounded-xl`.

Status nos chips:

| Status | Estilo |
|---|---|
| ativo / em andamento | `bg-secondary/20 text-secondary` |
| rascunho / aguardando | `bg-white/8 text-white/45`; em "Meus desafios", `bg-yellow-500/15 text-yellow-400/70` |
| campeonato oficial (inscrições abertas / em andamento) | `bg-cane/20 text-cane` |
| encerrado | `bg-white/5 text-white/30` |
| partida "Ao vivo" | texto neon com ponto pulsando (`.live-dot`, 1,6 s) |

Ícone de formato na lista: eliminatória usa `GitBranch` laranja (`text-orange-400/60`).

## Fontes

| Papel | Fonte | Pesos | Variável |
|---|---|---|---|
| Títulos (`font-display`) | **Sora** (Google Fonts) | 500, 600, 700, 800 | `--font-sora` |
| Texto (`font-sans`) | **Inter** (Google Fonts) | variável | `--font-inter` |

Ambas com `subsets: latin` e `display: swap`. Títulos usam `font-display font-bold` ou
`font-extrabold`, com `tracking-tight`.

Marca: "Squash" em branco e "Ba" em neon, Sora extrabold (`Squash<span class="text-secondary">Ba</span>`).
Logo: `public/brand/logo.png` (40 px padrão; 56 px no login; 44 px no onboarding).

## Raios e sombras

| Token | Valor | Uso |
|---|---|---|
| `--radius-card` | 24 px | `.glass-card` (cards) |
| `--radius-pill` | 999 px | `.glass-pill` (menu inferior, chips) |
| `rounded-2xl` | 16 px | campos, botões principais |
| `rounded-xl` | 12 px | caixas menores, mensagens de erro |
| `rounded-full` | — | avatares, botões de ícone, badges |
| `--shadow-glass` | `0 8px 32px rgba(8,14,28,0.45)` | cards de vidro |
| `--shadow-neon` | `0 8px 24px rgba(205,253,81,0.28)` | aba ativa e botões neon |

## Vidro (glassmorphism)

```css
.glass {
  background: linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.05) 100%);
  border: 1px solid rgba(255,255,255,.16);
  box-shadow: 0 8px 32px rgba(8,14,28,.45),
              inset 0 1px 0 0 rgba(255,255,255,.22),
              inset 0 -1px 0 0 rgba(255,255,255,.04);
}
.glass-overlay { backdrop-filter: blur(20px) saturate(140%); }  /* só em sobreposições (menu inferior, painéis) */
.glass-official {                                                   /* campeonato oficial */
  background: linear-gradient(135deg, rgba(140,195,74,.22) 0%, rgba(140,195,74,.06) 100%);
  border-color: rgba(140,195,74,.38);
}
```

O `.glass` comum **não** tem desfoque, porque fica sobre o degradê liso, onde o desfoque é
imperceptível. Só os elementos que se sobrepõem ao conteúdo (`.glass-overlay`) desfocam. No
iOS, o equivalente natural é `.ultraThinMaterial` nas barras e sobreposições, e um
preenchimento translúcido nos cards.

## Animações

- `.reveal`: aparece por opacidade (0,4 s, `cubic-bezier(0.22,1,0.36,1)`). Usada na
  cascata da tela Início, só na primeira abertura.
- `.fade-in`: 0,5 s.
- `.live-dot`: pulsa a opacidade 1 → 0,55 em 1,6 s.
- Com `prefers-reduced-motion`, tudo é desligado.
- Botões encolhem ao toque (`active:scale-95` ou `active:scale-90`).

## Navegação

### Abas (barra inferior no celular; trilho lateral no desktop)

Ordem e ícones (Lucide):

| # | Rótulo | Rota | Ícone | Ativa quando |
|---|---|---|---|---|
| 1 | Início | `/` | `Home` | caminho exatamente `/` |
| 2 | Campeonatos | `/campeonatos` | `Trophy` | começa com `/campeonatos` |
| 3 | Marketplace | `/marketplace` | `Store` | começa com `/marketplace` |
| 4 | Comunidade | `/comunidade` | `Users` | começa com `/comunidade` |
| 5 | Mensagens | `/mensagens` | `MessageSquare` | começa com `/mensagens` |

- Celular: pílula de vidro flutuante (`glass glass-overlay glass-pill`) centralizada no
  rodapé, respeitando a área segura. Mostra só ícones de 22 px (traço 2,6 quando ativo, 2
  quando inativo), com o rótulo apenas no `aria-label`.
- Aba ativa: círculo neon de 48 px (`bg-secondary text-primary`) com `--shadow-neon`.
  Inativa: `text-white/65`.
- Badge de não lidas em Mensagens: círculo neon com número escuro (`9+` acima de 9),
  escondido quando a aba está ativa.
- Celular deitado (altura ≤ 600 px): a pílula vira um trilho vertical à esquerda.
- Desktop (`lg`): trilho lateral com as mesmas 5 abas, mais o sino e o avatar.

### Barra superior (celular)

Da esquerda para a direita:

- logo (link para `/`) com o selo `Beta <versão>` (link para `/versao`);
- busca: ícone `Search` que se expande, com o placeholder `Pessoas, campeonatos, jogos…`;
- sino de notificações (`Bell`);
- avatar (abre o menu).

Ícones das notificações:

| Tipo | Ícone |
|---|---|
| `mensagem` | `MessageSquare` |
| `desafio_convite`, `desafio_aceito` | `Swords` |
| `campeonato` | `Trophy` |
| `feedback` | `MessageSquareWarning` |
| `professor` | `GraduationCap` |
| outros (inclui `denuncia`) | `Bell` |

### Menu do avatar

Na ordem:

| Item | Ícone | Rota | Visível para |
|---|---|---|---|
| Painel admin | `ShieldCheck` | `/admin` | admin |
| Gestão | `LayoutDashboard` | `/gestao` | organizador ou admin |
| Ser professor | `Trophy` | `/organizador` | quem **não** é organizador nem admin |
| Editar perfil | `Settings` | `/perfil` | todos |
| Ajuda e feedback | `CircleHelp` | `/ajuda` | todos |
| Sair | `LogOut` | `signOut` | todos |

Sem foto, o avatar mostra o ícone `User`.

Abas internas:

- Gestão: Jogadores, Categorias, Locais, Times.
- Painel admin: Denúncias, Usuários, Professores, Anúncios, Banners, Feedbacks (com badge
  de pendências em Denúncias e Feedbacks).

## Títulos das telas

| Tela | Título da aba do navegador | Título na tela |
|---|---|---|
| Login | — | `SquashBa` (marca) + subtítulo `A comunidade do Squash baiano`; cartão `Entrar` / `Criar conta` / `Redefinir senha` |
| Onboarding | — | `Complete seu perfil` · `Só precisa fazer isso uma vez` |
| Aceite dos termos | `Termos de Uso — SquashBa` | `Termos de Uso` |
| Início | — | saudação `Bem-vindo`/`Bem-vinda`, `<primeiro nome>` |
| Campeonatos | `Campeonatos` | `Campeonatos` |
| Detalhe do campeonato | `Campeonato` | nome do campeonato; abaixo, `<Formato> · <Unidade>` mais `· N grupos`, `· N× round-robin` ou `· com 3º lugar`, e `Início: <data>` |
| Novo campeonato / desafio | `Novo campeonato` / `Novo desafio` | — |
| Editar | `Editar campeonato` / `Editar desafio` | — |
| Desafio | `Desafio` | `Desafio 1v1` ou `Desafio por times · <A> × <B>` |
| Placar | `Placar` | sem título: no topo, `Voltar` e os selos (offline, sincronizando, `Encerrado`, ao vivo); os nomes dos lados ficam no placar |
| Comunidade | `Comunidade` | `Comunidade` |
| Jogador | `Jogador` | nome do jogador |
| Marketplace | `Marketplace` | seções `Professores` e `Produtos & Serviços` |
| Mensagens / Chat | `Mensagens` / `Chat` | nome da conversa |
| Perfil | `Editar perfil` | `Editar perfil` |
| Ajuda | `Ajuda` | `Ajuda` |
| Ser professor | `Ser professor` | `Ser professor` |
| Sincronização | `Sincronização` | `Sincronização` |

## PWA (referência)

`manifest.ts`:

- nome `SquashBa — A comunidade do Squash baiano`; nome curto `SquashBa`;
- `background_color #1d2b45`, `theme_color #2c364b`;
- `display: standalone`, retrato;
- ícones 192, 512 e 512 *maskable* em `public/icons/`.
