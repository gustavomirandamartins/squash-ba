# Modelo de dados

Schema `public` do projeto Supabase `rghlwuucqkvyzyycewje`. Fonte: catálogo do Postgres
(`pg_attribute`, `pg_constraint`, `pg_enum`, `pg_policies`, `pg_views`) lido em
2026-10-10, com as 67 migrations de `supabase/migrations/` (a última é
`20261010145445_push_devices`). Os grants de tabela, as políticas de Storage, os buckets e a
publicação de realtime foram lidos direto em produção. Colunas, enums, checks, views,
políticas e corpos de função foram lidos num banco local com as mesmas 67 migrations,
conferido antes com produção: as funções são iguais (desconsiderando comentários), assim
como as tabelas, views, políticas, enums, checks e gatilhos.

Convenções desta página:

- `NN` = `not null`; `= x` = valor padrão.
- **RLS** está ligado em **todas** as 30 tabelas.
- "public" nas políticas é o papel do Postgres `public` (vale para `anon` e
  `authenticated`). O que o anônimo consegue de fato também depende dos grants (ver
  [Grants](#grants)).

## Enums

| Tipo | Valores (na ordem do banco) |
|---|---|
| `app_role` | `player`, `organizer`, `admin` |
| `championship_format` | `liga`, `grupos_elim`, `eliminatoria`, `desafio` |
| `confront_unit` | `player`, `pair`, `team` |
| `counting_system` | `tempo`, `set` |
| `genero` | `masculino`, `feminino`, `outro`, `nao_informado` |
| `match_result` | `lado_a`, `lado_b`, `empate` |
| `match_status` | `agendado`, `em_andamento`, `finalizado`, `revisao` |
| `participant_kind` | `player`, `pair`, `team` |

### Valores em `text` com `check`

| Coluna | Valores aceitos |
|---|---|
| `championships.status` | `rascunho`, `ativo`, `encerrado` |
| `championship_stages.kind` | `grupos`, `liga`, `eliminatoria`, `triangular`, `final`, `desafio` |
| `participants.enrollment_source` | `organizador`, `jogador` |
| `participants.enrollment_status` | `pendente`, `confirmado`, `recusado` |
| `conversations.kind` | `direct`, `group` (e `group` exige `championship_id`) |
| `content_reports.target_type` | `post`, `comment`, `message`, `profile` |
| `content_reports.reason` | `spam`, `ofensa_ou_assedio`, `conteudo_improprio`, `perfil_falso`, `outro` |
| `content_reports.status` | `aberta`, `resolvida`, `descartada` |
| `feedback.type` | `bug`, `sugestao`, `critica`, `geral` |
| `feedback.status` | `novo`, `lido`, `resolvido` |
| `organizer_requests.status` | `pending`, `approved`, `rejected` |
| `community_posts.embed_provider` | `youtube`, `instagram`, `link` |
| `push_devices.platform` | `ios` |
| `push_devices.environment` | `sandbox`, `production` |

`notifications.type` **não tem check**. Os valores gravados pelo banco hoje (gatilhos) são:
`mensagem`, `campeonato`, `desafio_convite`, `desafio_aceito`, `denuncia`, `feedback`,
`professor` (ver [push.md](push.md)).

Códigos de desempate (`championships.tiebreakers`, `text[]`, sem check): `sets_ganhos`,
`pontos_ganhos`, `pontos_sofridos_asc`. Outros valores são ignorados pelas RPCs de
classificação.

### Rótulos usados na interface

| Valor | Rótulo |
|---|---|
| formato `liga` / `grupos_elim` / `eliminatoria` / `desafio` | Liga / Grupos + Eliminatórias / Eliminatórias / Desafio |
| unidade `player` / `pair` / `team` | Jogador / Dupla / Time (no assistente: "Jogador (1v1)", "Dupla (2v2)", "Time") |
| status do campeonato `rascunho` / `ativo` / `encerrado` | Rascunho / Ativo / Encerrado. Campeonato oficial na lista: Inscrições abertas / Em andamento / Encerrado. "Meus desafios": Aguardando / Em andamento / Encerrado |
| status da partida `agendado` / `em_andamento` / `finalizado` | A realizar / Ao vivo / Encerrado |
| desempate `sets_ganhos` / `pontos_ganhos` / `pontos_sofridos_asc` | Sets ganhos / Pontos ganhos / Menos pontos sofridos |
| motivo da denúncia | Spam / Ofensa ou assédio / Conteúdo impróprio / Perfil falso / Outro |
| alvo da denúncia `post` / `comment` / `message` / `profile` | Post / Comentário / Mensagem / Perfil |
| tipo de feedback | Bug / Sugestão / Crítica / Geral |
| gênero | Masculino / Feminino / Outro / Prefiro não informar |

## Tabelas

### Pessoas e papéis

**`profiles`** (dados públicos do jogador; criado pelo gatilho `handle_new_user`)
`id uuid NN` (= `auth.users.id`) · `full_name text` · `birth_date date` ·
`gender genero = 'nao_informado'` · `avatar_url text` · `onboarding_completed bool NN = false` ·
`created_at timestamptz NN = now()` · `updated_at timestamptz NN = now()` (gatilho) ·
`category_id uuid → categories` · `team_id uuid → teams` · `terms_accepted_at timestamptz`

**`profiles_private`** (só o dono e o admin leem)
`user_id uuid NN PK → auth.users` · `phone text` · `email text`

**`user_roles`**: `id` · `user_id uuid NN → auth.users` · `role app_role NN` ·
`granted_by uuid → auth.users` · `created_at`. Único `(user_id, role)`. Todo usuário novo
recebe `player`. "Professor" na interface = papel `organizer`.

**`organizer_requests`** (pedido para ser professor): `id` · `user_id uuid NN` (único) ·
`status text NN = 'pending'` · `reviewed_by uuid` · `reviewed_at timestamptz` · `created_at`

**`user_blocks`**: `blocker_id uuid NN → profiles` · `blocked_id uuid NN → profiles` ·
`created_at`. PK `(blocker_id, blocked_id)`; check `blocker_id <> blocked_id`.

**`categories`**: `id` · `name text NN` · `description text` · `created_by = auth.uid()` ·
`created_at` · `updated_at`

**`teams`**: `id` · `name text NN` · `address text` · `has_own_venue bool NN = false` ·
`home_venue_id uuid → venues` · `created_by` · `created_at` · `updated_at`. Check: com
`has_own_venue = true`, `home_venue_id` é obrigatório.

**`venues`** (locais): `id` · `name text NN` · `address text` · `created_by` · `created_at` · `updated_at`

**`courts`** (quadras): `id` · `venue_id uuid NN → venues (cascade)` · `name text NN` · `created_at`

### Campeonatos, desafios e partidas

Desafio também é uma linha de `championships`, com `format = 'desafio'`.

**`championships`**
`id uuid NN = gen_random_uuid()` · `name text NN` · `format championship_format NN` ·
`unit confront_unit NN` · `points_win int NN = 3` · `points_draw int NN = 1` ·
`points_loss int NN = 0` · `allow_draw bool NN = false` ·
`tiebreakers text[] NN = {sets_ganhos, pontos_ganhos, pontos_sofridos_asc}` ·
`status text NN = 'rascunho'` · `created_by uuid = auth.uid()` · `created_at` · `updated_at` ·
`has_final bool NN = false` (desafio por times) · `has_third_place bool NN = false` ·
`start_date date` · `end_date date` · `is_official bool NN = false` · `description text` ·
`venue_id uuid → venues`

**`championship_stages`** (fases)
`id` · `championship_id uuid NN (cascade)` · `name text NN` · `ordering int NN = 0` ·
`kind text NN` · `counting counting_system NN = 'set'` · `rounds int NN = 1` (turnos) ·
`sets_to_play int NN = 3` · `points_per_set int NN = 11` · `win_by_two bool NN = true` ·
`set_draw_enabled bool NN = false` · `time_minutes int` · `created_at`

**`groups`**: `id` · `stage_id uuid NN → championship_stages (cascade)` · `name text NN` ·
`ordering int NN = 0`. As RPCs gravam o nome como letra (`A`, `B`…); criações antigas e as
feitas offline gravaram `Grupo A`. Ver `groupLabel` em [regras.md](regras.md).

**`championship_teams`** (os dois lados de um desafio por times): `id` ·
`championship_id NN (cascade)` · `name text NN` · `team_id uuid → teams` · `ordering int NN = 0`

**`participants`** (um lado de confronto: jogador, dupla ou membro de time)
`id` · `championship_id NN (cascade)` · `kind participant_kind NN` · `display_name text` ·
`championship_team_id uuid → championship_teams` · `enrollment_source text NN = 'organizador'` ·
`enrollment_status text NN = 'confirmado'` · `seed int` · `created_at` (ordem de geração dos
jogos) · `group_id uuid → groups`

**`participant_members`**: `id` · `participant_id NN (cascade)` · `user_id NN → profiles/auth.users`.
Único `(participant_id, user_id)`. Uma dupla tem 2 linhas.

**`matches`**
`id` · `championship_id NN (cascade)` · `stage_id → championship_stages` · `group_id → groups` ·
`round int` · `bracket_slot int` · `side_a_participant_id` · `side_b_participant_id` ·
`court_id → courts` · `scheduled_at timestamptz` · `status match_status NN = 'agendado'` ·
`result match_result` · `duration_seconds int` · `winner_advances_to uuid → matches` ·
`created_at` · `updated_at` · `conflict_server_snapshot jsonb` · `last_device_id text` ·
`is_wo bool NN = false` · `is_double_wo bool NN = false`

`bracket_slot`: `null` ou `0` = partida de tabela (liga, grupos, desafio); `> 0` = posição
na chave; `-1` = final do desafio por times; `-2` = disputa de 3º lugar. Bye (passagem
automática) nasce `finalizado`, com o lado vazio e `result` para o lado presente.

**`match_games`** (um set/game): `id` · `match_id NN (cascade)` · `game_number int NN = 1` ·
`score_a int NN = 0` · `score_b int NN = 0` · `last_device_id text`. Único
`(match_id, game_number)`. No modo por tempo há só o game 1, que guarda o placar final.

### Social e mensagens

**`community_posts`**: `id` · `author_id NN → profiles` · `body text` (≤ 2000) ·
`image_path text` (caminho no bucket `community`) · `embed_url text` · `embed_provider text` ·
`created_at`. Check: precisa de texto, imagem ou link.

**`community_post_comments`**: `id` · `post_id NN (cascade)` · `author_id NN` ·
`body text NN` (1 a 1000 caracteres, sem contar espaços nas pontas) · `created_at`

**`community_post_likes`**: `post_id` · `user_id` · `created_at`. PK `(post_id, user_id)`.

**`conversations`**: `id` · `kind text NN` · `championship_id → championships (cascade)` ·
`title text` · `created_at`

**`conversation_members`**: `id` · `conversation_id NN (cascade)` · `user_id NN → auth.users` ·
`last_read_at timestamptz = now()`. Único `(conversation_id, user_id)`.

**`messages`**: `id` · `conversation_id NN (cascade)` · `sender_id NN → auth.users` ·
`body text NN` (1 a 2000) · `created_at`

**`notifications`**: `id` · `user_id NN` · `type text NN` · `title text NN` · `body text` ·
`url text` · `read bool NN = false` · `created_at`

**`content_reports`** (denúncias): `id` · `reporter_id NN = auth.uid()` · `target_type NN` ·
`target_id uuid NN` · `reason NN` · `details text` (≤ 1000) · `status NN = 'aberta'` ·
`resolved_by` · `resolved_at` · `created_at`. Índice único parcial
`(reporter_id, target_type, target_id) where status = 'aberta'`: uma denúncia aberta por
pessoa e alvo (o erro é `23505`).

**`feedback`**: `id` · `user_id → auth.users` · `user_name text` · `message text NN` (5 a
1000) · `type NN = 'geral'` · `status NN = 'novo'` · `created_at`

### Push, anúncios e patrocinadores

**`push_devices`** (iOS): `id` · `user_id NN → profiles (cascade)` · `token text NN` (único) ·
`platform NN = 'ios'` · `environment NN` · `created_at` · `updated_at` · `last_error text`

**`push_subscriptions`** (Web Push): `id` · `user_id NN` · `endpoint` · `p256dh` · `auth_key` ·
`created_at`. Único `(user_id, endpoint)`.

**`ads`** (anúncios do Marketplace): `id` · `name NN` · `product_service NN` · `phone` · `email` ·
`address` · `active bool NN = true` · `ordering int NN = 0` · `created_at`

**`sponsor_banners`**: `image_name text PK` (nome do arquivo no bucket `sponsors`) ·
`link_url text` · `updated_at`

## Views

As quatro views usam `security_invoker = on`, ou seja, respeitam o RLS de quem consulta.

**`v_participant_match_stats`**: uma linha por (partida finalizada × lado). Ignora W.O.
duplo e lados vazios.
Colunas: `championship_id`, `participant_id`, `match_id`, `outcome` (`win` | `draw` | `loss`),
`pontos_favor`, `pontos_contra`, `sets_ganhos`, `sets_perdidos`, `sets_empatados` (bigint).
Em W.O. (`is_wo`), pontos e sets são 0. Set ganho segue a mesma regra de `resolve_match`
(ver [regras.md](regras.md)). No modo por tempo, os sets são sempre 0 e os pontos são o
placar.

**`v_participant_championship_stats`**: soma da anterior por (`championship_id`,
`participant_id`). Colunas: `v`, `e`, `d` (bigint), `pontos_favor`, `pontos_contra`,
`sets_ganhos`, `sets_perdidos`, `sets_empatados` (numeric).

**`v_team_standings`**: só desafios com `format = 'desafio'` e `unit = 'team'`. Soma por
`championship_team_id` dos participantes confirmados do time. Colunas: `championship_id`,
`championship_team_id`, `team_name`, `v`, `e`, `d`, `pontos_favor`, `pontos_contra`,
`sets_ganhos`, `sets_perdidos` (int). Sem ordenação: a tela ordena.

**`v_user_lifetime_stats`**: soma por `user_id` (via `participant_members`) de todas as
partidas da vida. Colunas: `user_id`, `v`, `e`, `d`, `pontos_favor`, `pontos_contra`,
`sets_ganhos`, `sets_perdidos`, `sets_empatados`.

## Exclusões em cascata

Ao excluir a conta (`auth.users`), saem em cascata: `profiles`, `profiles_private`,
`user_roles`, `organizer_requests`, `conversation_members`, `messages`, `notifications`,
`push_subscriptions`, `participant_members` e, via `profiles`, `push_devices`,
`user_blocks`, `content_reports` (como denunciante), posts, comentários e curtidas. Viram
`null`: `championships.created_by`, `teams.created_by`, `venues.created_by`,
`categories.created_by`, `feedback.user_id`. Em `organizer_requests.reviewed_by` e
`user_roles.granted_by` a FK é `NO ACTION`: excluir um admin que já revisou pedidos ou
concedeu papéis falha (comportamento do banco, não testado aqui).

Excluir um campeonato apaga em cascata fases, grupos, times do desafio, participantes,
partidas, games e a conversa do campeonato.

## Grants

Lidos em produção.

| Tabela/view | `anon` | `authenticated` |
|---|---|---|
| `push_devices` | — | só `SELECT` (escrita apenas pelas RPCs) |
| `content_reports`, `user_blocks` | — | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| `organizer_requests`, `profiles_private`, `user_roles` | sem `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| demais tabelas e as 4 views | `SELECT` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |

O grant só abre a porta: o que cada um lê ou grava é decidido pelo RLS.

## Políticas de RLS (resumo)

`auth.uid()` = usuário logado. `can_manage(c)` = `can_manage_championship(c)`: organizador
(professor), admin ou quem criou o campeonato.

| Tabela | Ler | Gravar |
|---|---|---|
| `profiles` | todos | `UPDATE` só a própria linha |
| `profiles_private` | dono ou admin | `UPDATE` só a própria linha |
| `user_roles` | as próprias linhas, ou admin; logado lê todas as linhas `organizer` | só admin |
| `organizer_requests` | dono ou admin | `INSERT` o próprio; `UPDATE` admin |
| `user_blocks` | só as que eu criei (`blocker_id = eu`) | `INSERT`/`DELETE` com `blocker_id = eu` |
| `categories`, `teams`, `venues`, `courts` | todos | organizador ou admin |
| `championships` | todos | `INSERT`: `created_by = eu` e (não oficial ou organizador/admin). `UPDATE`/`DELETE`: `can_manage(id)` |
| `championship_stages`, `championship_teams`, `participants`, `matches` | todos | `can_manage(championship_id)` |
| `groups`, `participant_members` | todos | `can_manage` do campeonato dono |
| `match_games` | todos | `can_manage` **ou** membro de um dos lados da partida (só `authenticated`) |
| `community_posts` | quem não está bloqueado com o autor (nos dois sentidos) | `INSERT` com `author_id = eu`; `DELETE` autor ou admin |
| `community_post_comments` | quem não está bloqueado com o autor | `INSERT` com `author_id = eu` e post não bloqueado; `DELETE` autor do comentário, autor do post ou admin |
| `community_post_likes` | todos | `INSERT` com `user_id = eu` e post não bloqueado; `DELETE` a própria |
| `conversations` | membros | `INSERT` qualquer logado |
| `conversation_members` | a própria linha ou membros da conversa | `INSERT` qualquer logado; `UPDATE`/`DELETE` a própria linha |
| `messages` | membros, exceto mensagens de quem eu bloqueei | `INSERT` com `sender_id = eu`, sendo membro e com a conversa direta sem bloqueio |
| `notifications` | as minhas | `UPDATE`/`DELETE` as minhas. Não há `INSERT` pelo cliente: só pelos gatilhos |
| `content_reports` | as minhas, ou admin | `INSERT` com `reporter_id = eu`, `status = 'aberta'`, sem `resolved_*`; `UPDATE` admin |
| `feedback` | admin | `INSERT` com `user_id = eu`; `UPDATE`/`DELETE` admin |
| `push_devices` | os meus | nenhuma (usar RPC) |
| `push_subscriptions` | os meus | os meus |
| `ads` | `active = true` (anon e logado); admin vê todos | admin |
| `sponsor_banners` | todos | admin |

## Gatilhos que mudam dados

| Tabela | Gatilho | Efeito |
|---|---|---|
| `auth.users` (insert) | `handle_new_user` | cria `profiles` (com `terms_accepted_at = now()` se o metadado `terms_accepted` for `"true"`), `profiles_private (email)` e o papel `player` |
| `championships` (status `rascunho → ativo`) | `championship_status` | gera as partidas conforme o formato (ver [regras.md](regras.md)) |
| `championships` (status `ativo → rascunho`) | `championship_status` | apaga as partidas; recusa se já há partida finalizada |
| `championships` (status → `ativo`) | `championship_conversation` | cria a conversa `group` do campeonato com os participantes confirmados |
| `championships` (insert oficial em rascunho; oficial `rascunho → ativo`) | `notify_official_*` | notificação `campeonato` para **todos** os perfis |
| `championships` (update) | `championships_lock` | trava formato e pontuação fora do rascunho; só organizador/admin muda `is_official` |
| `championship_stages` (update) | `championship_stages_lock` | trava as regras da fase fora do rascunho |
| `participants` (insert/update) | `participants_guard` | só com o campeonato em rascunho (delete é liberado) |
| `participant_members` (insert) | `notify_enrollment` | convite de desafio ou "Você foi inscrito" |
| `participants` (update de `enrollment_status`) | `notify_challenge_accept` | avisa o criador do desafio que o convite foi aceito |
| `match_games` (qualquer mudança) | `match_games_resolve` | recalcula `status`/`result` da partida (`resolve_match`) |
| `matches` (update de status) | `bracket_advance` | avança o vencedor na chave e leva os perdedores das semifinais ao 3º lugar |
| `matches` (update de status) | `auto_generate_bracket` | grupos+elim: gera a chave quando todos os jogos de grupo (e da repescagem) terminam |
| `matches` (insert/update de status) | `z_close_championship` | encerra o campeonato quando não sobra partida aberta; reabre se uma volta a abrir |
| `matches` (update) | `matches_clear_double_wo` | `is_wo = false` zera `is_double_wo` |
| `messages` (insert) | `notify_message` | notificação `mensagem` para os membros (menos o remetente e quem o bloqueou) |
| `messages` (insert) | `on_new_message_push` | chama a Edge Function `send-push` |
| `notifications` (insert) | `notify_push` | chama a Edge Function `notify-push` |
| `content_reports` (insert) | `content_reports_check` | confere que o alvo existe e não é do próprio denunciante |
| `content_reports` (insert) | `notify_content_report` | notificação `denuncia` para os admins |
| `feedback` (insert) | `notify_feedback` | notificação `feedback` para os admins |
| `organizer_requests` (insert) | `notify_organizer_request` | notificação `professor` para os admins |

## Realtime

Publicação `supabase_realtime` em produção: **`conversation_members`, `conversations`,
`messages`, `notifications`**.

`matches` e `match_games` **não** estão na publicação. O web assina mudanças nessas duas
tabelas (`use-championship-realtime.ts`, `useScoreEngine.ts`), mas essas assinaturas não
recebem eventos. A atualização vem da recarga ao abrir/voltar e do envio da fila.

## Storage

| Bucket | Público | Limite/MIME | Políticas |
|---|---|---|---|
| `avatars` | sim | sem limite configurado | leitura pública; escrita, troca e exclusão só na pasta `<uid>/` do próprio usuário |
| `community` | sim | sem limite | leitura pública; escrita/troca/exclusão (logado) só na pasta `<uid>/` |
| `logo` | sim | sem limite | nenhuma política em `storage.objects` (só leitura pela URL pública) |
| `sponsors` | sim | sem limite | logado pode listar; sem política de escrita (imagens sobem pelo painel do Supabase) |

Caminhos usados pelo app: avatar `avatars/<uid>/avatar.jpg` (com `upsert`); foto de post
`community/<uid>/<uuid>.jpg`. O web comprime antes de enviar (JPEG, lado máximo de 800 px,
até 480 KB).
