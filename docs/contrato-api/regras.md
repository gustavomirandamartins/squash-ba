# Regras de negócio

Esta página separa o que o **banco** garante (vale para qualquer cliente) do que só o
**cliente web** faz. O app iOS precisa reproduzir o segundo grupo para ter o mesmo
comportamento.

## Senha

- **Cliente:** mínimo de **8 caracteres** para criar conta e para trocar ou redefinir a
  senha (`MIN_PASSWORD_LENGTH = 8`, em `src/lib/auth/password.ts`). A dica exibida é
  `Mínimo de 8 caracteres.`
- Para **entrar**, basta a senha não estar vazia: contas antigas têm senhas de 6 ou 7
  caracteres e continuam entrando.
- **Servidor (Supabase Auth):** o código cita o mínimo configurado no painel, mas o valor em
  produção é **NÃO CONFIRMADO** (o `supabase/config.toml` do repositório é de ambiente
  local e tem `minimum_password_length = 6`).
- Tradução das recusas do Auth: ver [auth.md](auth.md#mensagens-de-erro).

## Termos de Uso obrigatórios

- No cadastro, o botão só é liberado com a caixa `Li e aceito os Termos de Uso` marcada. O
  `signUp` envia `data: { terms_accepted: true }`, e o gatilho `handle_new_user` grava
  `profiles.terms_accepted_at = now()`.
- Quem tem `terms_accepted_at = null` (conta antiga, ou criada por link mágico sem passar
  pelo cadastro) é levado a `/termos/aceitar` antes de usar o app. O aceite chama a RPC
  `accept_terms`.
- Ordem das checagens ao abrir o app (`src/app/(app)/layout.tsx`): sem sessão → `/login`;
  `onboarding_completed = false` → `/onboarding`; `terms_accepted_at = null` →
  `/termos/aceitar`.
- Versão do texto: `TERMS_UPDATED_AT = '9 de outubro de 2026'`, com 11 seções
  (`src/components/TermsContent.tsx`). Não existe versionamento do aceite no banco: um aceite
  vale para qualquer versão. O texto promete pedir novo aceite em mudança relevante, mas
  isso **não está implementado**.

## Onboarding

- Obrigatórios: nome completo e o consentimento LGPD
  (`Li e concordo com a Política de Privacidade e autorizo o tratamento dos meus dados pessoais conforme a LGPD.`).
- Menor de 18 anos (pela data de nascimento): também é obrigatório marcar
  `Estou realizando este cadastro com o consentimento e supervisão do meu responsável legal.`
  Nada disso é gravado no banco; só libera o botão.
- Opcionais: data de nascimento (não pode ser futura), gênero (padrão `nao_informado`),
  categoria, time, telefone (máscara `(XX) XXXXX-XXXX`, até 11 dígitos, gravado como
  digitado em `profiles_private.phone`) e foto.
- Ao salvar: `profiles.onboarding_completed = true`.

## Pontuação da tabela (padrão)

`src/lib/table-points.ts`:

| Situação | Vitória | Empate | Derrota |
|---|---|---|---|
| Empate possível (contagem por tempo, ou empate no set ligado) | 3 | 1 | 0 |
| Sem empate | 1 | — (gravado como 0) | 0 |

- "Empate possível" no assistente de campeonato: em grupos+elim, olha a fase de grupos; nos
  demais, a fase única: `counting == 'tempo' || set_draw_enabled`.
- Os assistentes trocam o padrão sozinhos quando o empate liga ou desliga, **até o
  organizador mexer em algum ponto**. A partir daí vale o que ele escolheu (`pointsEdited`).
- O estado inicial do assistente é sem empate (V 1 · D 0).
- **Banco:** sem empate, as RPCs gravam `points_draw = 0`. Eliminatória nunca tem empate. Os
  padrões do banco, quando o campo não vem, são 3 / 1 / 0.

## Sets e vantagem de 2

Mesma regra no banco (`resolve_match`, `v_participant_match_stats`) e na tela de placar.
`P = points_per_set`.

- **Set vencido**
  - Com `win_by_two`: o lado chega a `≥ P` **e** abre `≥ 2` de vantagem.
  - Sem `win_by_two`: o lado chega a `≥ P` e está na frente.
- **Set empatado** (só com `set_draw_enabled`): placar igual e `≥ P`.
- Sets para vencer: `need = floor(sets_to_play / 2) + 1` (MD3 → 2, MD5 → 3, MD1 → 1).
- **Encerramento automático (banco)**: a cada mudança em `match_games`, `resolve_match`
  recalcula:
  - um lado com `need` sets → `finalizado` com o vencedor;
  - todos os `sets_to_play` jogados e decididos → quem tem mais sets vence; empate em sets
    → `empate` se `set_draw_enabled`, senão continua `em_andamento`;
  - sem games → `agendado`; com games → `em_andamento`.
- O placar é **absoluto** por game (`score_a`, `score_b`): enviar o mesmo game de novo
  sobrescreve.
- Rótulo do formato na tela: `até 11+2` (com vantagem de 2) ou `até 11`.

### Botão "Encerrar partida" (cliente)

1. Por sets: se algum lado tem `need` sets → encerra direto com o vencedor
   (`finalize_match_manual` ou `finalize_match_by_participant`).
2. Por tempo: placar diferente → encerra com o vencedor.
3. Senão, abre um modal com duas saídas:
   - **Desclassificação** de um lado → o outro vence (`finalize_match_dq*`), o placar parcial
     é apagado e conta como vitória/derrota normal, sem sets nem pontos.
   - **Interrompida**: vence quem tem mais sets; empatado em sets, quem tem mais pontos
     somados; persistindo o empate, o organizador escolhe o resultado (`tieBreak`). No modo
     tempo: placar maior, senão o organizador escolhe.
- Depois de encerrar nesta sessão, a tela volta sozinha para a lista em 2 s.

## Modo por tempo (`counting = 'tempo'`)

- Há só o game 1, que guarda o placar final.
- O placar fica bloqueado até o cronômetro ser iniciado. O cronômetro conta para cima; o
  tempo pausado fica só no aparelho (`localStorage`).
- `time_minutes` é o tempo estipulado. Ao ultrapassar, o aparelho vibra uma vez e mostra
  `Tempo esgotado · N min — encerre a partida`. **Não encerra sozinho.**
- Encerrar o cronômetro (sempre pela fila) grava **primeiro** `matches.duration_seconds` e
  **depois** o game 1. A ordem importa: `resolve_match` só finaliza uma partida por tempo
  com `duration_seconds` preenchido. Por isso pausar não grava nada no servidor.
- Resultado: placar maior vence; placar igual → `empate` só com `set_draw_enabled` na fase;
  senão a partida fica `em_andamento`.
- Atenção: em desafio e em campeonato, `allow_draw` (pontuação da tabela) é ligado
  automaticamente quando a contagem é por tempo, mas o empate **da partida** depende de
  `set_draw_enabled` da fase.
- Nas estatísticas, partidas por tempo têm 0 sets e somam o placar como pontos.

## W.O., W.O. duplo e desclassificação

| Caso | Resultado gravado | Placar | Tabela/estatísticas |
|---|---|---|---|
| W.O. | `result` = vencedor, `is_wo = true` | apagado | vitória/derrota; 0 sets e 0 pontos |
| W.O. duplo | `result = null`, `is_wo = true`, `is_double_wo = true` | apagado | a partida **não conta** para ninguém (sai das views). Texto na tela: `Nenhum dos dois compareceu — a partida não pontua.` |
| Desclassificação | `result` = o outro lado, `is_wo = false` | apagado | vitória/derrota normal, 0 sets e 0 pontos |

- W.O. duplo **não é permitido** em partida de chave (`bracket_slot` diferente de 0 ou
  null). A tela esconde a opção (`allowDoubleWo = bracket_slot == 0`) e o banco recusa.
- Reabrir uma partida põe `is_wo = false`, e o gatilho também zera `is_double_wo`.

## Quem pode lançar placar

- `can_manage_championship`: organizador (professor), admin ou criador do campeonato. Na
  tela, é tratado como "organizador" (`isOrganizer`).
- Participante da partida: membro do lado A ou B. Pode lançar placar, encerrar, dar W.O.,
  desclassificar, reabrir, limpar e mudar a data.
- Diferenças:
  - conflito: só o organizador abre revisão; para o participante, o placar enviado
    prevalece;
  - reabrir: participante usa `reopen_match_by_participant`; organizador faz `UPDATE` em
    `matches` (só se finalizada).
- Resolver conflito (`resolve_match_conflict`) exige `can_manage`.

## Geração de jogos (banco)

Acontece quando o campeonato passa de `rascunho` para `ativo`.

| Formato | Geração |
|---|---|
| Liga, desafio 1v1 e desafio de duplas | todos contra todos pelo método do círculo, ordem por `participants.created_at`; nº ímpar → um folga por rodada; `rounds` turnos (o mando inverte em rodadas pares e no returno) |
| Desafio por times | cada jogador de A contra cada jogador de B, repetido `rounds` vezes. Final opcional via `generate_team_challenge_final` |
| Eliminatória | chave do tamanho da próxima potência de 2, cabeças de chave por `seed` (sem seed por último, depois `created_at`), byes já finalizados para o lado presente. **3 participantes → vira todos contra todos (triangular).** Com `has_third_place` e chave de 4 ou mais: jogo de 3º lugar (`bracket_slot = -2`) |
| Grupos+elim | todos contra todos dentro de cada grupo. Quando todos os jogos de grupo terminam, a chave é gerada sozinha: classificam `ceil(tamanho do 1º grupo / 2)` por grupo, pela ordem de `get_standings`. Com 2 grupos, cruzamento espelhado (1ºA × último classificado de B…); com mais grupos, distribuição alternada pelas pontas da chave |

- Avanço: o vencedor de uma partida com `bracket_slot` ímpar vai para o lado A da seguinte;
  com slot par, para o lado B. Os perdedores das semifinais vão para o jogo de 3º lugar.
- O campeonato encerra sozinho quando não sobra partida `agendado`/`em_andamento`, e
  reabre se uma partida volta a ficar aberta.
- Voltar de `ativo` para `rascunho` apaga os jogos, mas é recusado se houver jogo
  finalizado.

## Desempate e classificação

- `pontos = V·points_win + E·points_draw + D·points_loss`.
- Ordem: pontos ↓ e, em seguida, os critérios de `tiebreakers` **na ordem gravada**:
  - `sets_ganhos` → mais sets ganhos;
  - `pontos_ganhos` → mais pontos a favor;
  - `pontos_sofridos_asc` → menos pontos contra.
- Último critério: nome em ordem alfabética. A posição é sempre única.
- Padrão dos assistentes: `sets_ganhos`, `pontos_ganhos`, `pontos_sofridos_asc`.
- Ficam de fora da contagem: W.O. duplo, partidas não finalizadas e participantes não
  confirmados.
- Desafio por times: placar por time (`v_team_standings`) somando os jogadores; a final usa
  o melhor jogador de cada time (sets ganhos, depois pontos a favor).
- Offline, o web recalcula a tabela no aparelho com as mesmas regras
  (`src/lib/standings/compute.ts`).

## Ranking

`get_rankings`: soma por jogador de todas as partidas finalizadas com resultado (inclui
desafios e W.O. simples).

- **Pontos por jogo:** vitória 2, empate 1, derrota 1 (jogou, ganha 1).
- **Bônus de colocação** (campeonatos encerrados, exceto desafios):
  - oficial: 1º 15, 2º 10, 3º 5;
  - não oficial: 1º 5, 2º 3, 3º 1.
  - Pódio da eliminatória: final (maior rodada da fase eliminatória) e jogo de 3º lugar.
  - Pódio da liga: top 3 por pontos e saldo de sets.
- **Bônus de participação:** 5 por campeonato **oficial** encerrado (não desafio) em que o
  jogador estava confirmado.
- `points = game_points + bonus_points`. Ordem: points ↓, `set_balance` ↓, wins ↓.
- O W.O. duplo tem `result = null` e não entra.

## Bloqueio

- Bloquear é `INSERT` em `user_blocks` (bloquear de novo dá `23505`, tratado como
  sucesso). Desbloquear é `DELETE`.
- Efeitos (banco), em qualquer sentido do bloqueio:
  - posts e comentários de um somem para o outro;
  - não dá para curtir nem comentar post do outro;
  - a conversa direta some da lista e não aceita mensagem;
  - não dá para abrir nova conversa nem desafiar.
- Em conversa de grupo, quem bloqueou deixa de ver as mensagens do bloqueado e não recebe
  notificação nem push delas.
- A ficha do jogador bloqueado esconde o menu (⋯). O desbloqueio fica em Perfil.

## Denúncia

- `INSERT` em `content_reports` (alvo: post, comentário, mensagem ou perfil). Detalhes
  opcionais, até 1000 caracteres.
- Uma denúncia aberta por pessoa e alvo. O erro `23505` vira
  `Você já denunciou isto. A denúncia está em análise.`
- Não dá para denunciar o próprio conteúdo nem uma mensagem de conversa da qual você não é
  membro.
- Cada denúncia gera uma notificação para os admins.

## Limites de texto

| Campo | Limite |
|---|---|
| Post | até 2000 caracteres (pode ser vazio se tiver foto ou link) |
| Comentário | 1 a 1000 (sem contar espaços nas pontas) |
| Mensagem | 1 a 2000 |
| Feedback | 5 a 1000. Mensagens: `Mensagem muito curta (mínimo 5 caracteres).` / `Mensagem muito longa (máximo 1000 caracteres).` |
| Detalhes da denúncia | até 1000 |

## Nome de grupo (`groupLabel`)

`src/lib/group-label.ts`: o banco tem nomes `A` (convenção atual) e `Grupo A` (criações
antigas e offline). A exibição é sempre `Grupo X`: se o nome já começa com "grupo", fica
como está; vazio vira `Grupo`.

## Recarga ao voltar ao app (`onAppReturn`)

`src/lib/on-app-return.ts`: ao voltar ao app (`focus` ou `visibilitychange`), recarrega no
máximo **uma vez a cada 30 s** (`APP_RETURN_INTERVAL_MS = 30_000`). A primeira recarga só
ocorre 30 s depois da montagem. Usado em:

- sino de notificações (recarrega a lista);
- contador de não lidas;
- chat (marca a conversa como lida).

A sincronização de placar **não** usa esse limite: ao voltar ao app ela é disparada em
300 ms (ver [placar-offline.md](placar-offline.md)).

## Outras regras do cliente

- Nome exibido de um participante: os `full_name` dos membros unidos por ` / `. Sem nome,
  `Lado A`/`Lado B` no placar e `Jogador` na tabela.
- Ao começar ou terminar uma partida sem data, a tela grava `scheduled_at` = hoje ao
  meio-dia (horário do aparelho).
- Contador de não lidas na aba Mensagens: mostra `9+` acima de 9.
- Aniversário (cartão na tela Início): mesmo dia e mês de `birth_date`, comparados em UTC.
- Saudação: `Bem-vinda` se `gender = 'feminino'`; senão `Bem-vindo`.
