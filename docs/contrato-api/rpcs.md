# RPCs

São as 50 funções do schema `public` que o papel `authenticated` pode executar (lidas em
produção com `has_function_privilege`). Ficam de fora as funções de gatilho
(`set_updated_at`, `trg_matches_clear_double_wo`), que não são chamáveis, e as funções
internas, sem `EXECUTE` para `authenticated` (`resolve_match`, `notify`,
`insert_participant`, os geradores de jogos etc.).

As assinaturas, validações e mensagens abaixo vêm do corpo das funções. As mensagens de
erro estão copiadas exatamente: com ou sem acento e ponto final, como estão no banco.

Chamada: `POST /rest/v1/rpc/<nome>`, com o corpo em JSON usando os nomes dos parâmetros (o
supabase-js faz isso em `supabase.rpc('<nome>', { … })`). Um `raise exception` chega como
HTTP 400, com a mensagem em `message` e o código `P0001`.

Legenda:

- **SD** = `security definer` (roda com o dono, ignora o RLS e faz as próprias checagens);
  **SI** = `security invoker` (respeita o RLS de quem chama).
- **anon**: também executável sem login.
- `can_manage` = `can_manage_championship(id)`: organizador (professor), admin ou criador do
  campeonato.
- "participante da partida" = membro (`participant_members`) do lado A ou do lado B.

## Índice

| RPC | Retorno | Quem pode | Tipo |
|---|---|---|---|
| [`accept_terms`](#accept_terms) | `timestamptz` | logado | SD |
| [`add_participant`](#add_participant) | `uuid` | `can_manage` | SD |
| [`apply_match_ops`](#apply_match_ops) | `jsonb` | `can_manage` ou participante da partida | SD |
| [`approve_organizer_request`](#approve_organizer_request) | `void` | admin | SD |
| [`blocked_with`](#blocked_with) | `boolean` | todos (anon) | SD |
| [`can_manage_championship`](#can_manage_championship) | `boolean` | todos (anon) | SD |
| [`conversation_blocked`](#conversation_blocked) | `boolean` | todos (anon) | SD |
| [`create_challenge`](#create_challenge) | `uuid` | logado | SD |
| [`create_championship`](#create_championship) | `uuid` | logado (oficial: organizador/admin) | SD |
| [`create_grupos_elim_championship`](#legado-create_liga_championship-e-create_grupos_elim_championship) | `uuid` | logado | SD, legado |
| [`create_liga_championship`](#legado-create_liga_championship-e-create_grupos_elim_championship) | `uuid` | logado | SD, legado |
| [`finalize_match_*`](#encerramento-de-partida) (8 funções) | `void` | `can_manage` ou participante | SD |
| [`flag_match_conflict`](#flag_match_conflict) | `void` | `can_manage` | SD |
| [`generate_team_challenge_final`](#generate_team_challenge_final) | `uuid` | `can_manage` | SD |
| [`get_community_feed`](#get_community_feed) | tabela | todos (anon) | SI |
| [`get_content_reports`](#get_content_reports) | tabela | admin | SD |
| [`get_group_standings`](#get_standings-e-get_group_standings) | tabela | logado | SD |
| [`get_my_conversations`](#get_my_conversations) | tabela | logado | SI |
| [`get_or_create_direct_conversation`](#get_or_create_direct_conversation) | `uuid` | logado | SD |
| [`get_rankings`](#get_rankings) | tabela | logado | SD |
| [`get_standings`](#get_standings-e-get_group_standings) | tabela | logado | SD |
| [`get_unread_total`](#get_unread_total) | `int` | logado | SI |
| [`grant_organizer_role`](#papéis-de-professor) | `void` | admin | SD |
| [`has_role`](#has_role-e-is_organizer_or_admin) | `boolean` | todos (anon) | SD |
| [`i_blocked`](#i_blocked) | `boolean` | todos (anon) | SD |
| [`import_championship`](#import_championship) | `uuid` | logado | SD |
| [`is_conversation_member`](#is_conversation_member) | `boolean` | todos (anon) | SD |
| [`is_organizer_or_admin`](#has_role-e-is_organizer_or_admin) | `boolean` | todos (anon) | SD |
| [`post_blocked`](#post_blocked) | `boolean` | todos (anon) | SD |
| [`register_push_device`](#register_push_device) | `uuid` | logado | SD |
| [`reject_organizer_request`](#papéis-de-professor) | `void` | admin | SD |
| [`reopen_match_by_participant`](#reopen_match_by_participant) | `void` | participante | SD |
| [`request_enrollment`](#request_enrollment) | `uuid` | logado | SD |
| [`reset_match_data`](#reset_match_data) | `void` | `can_manage` ou participante | SD |
| [`resolve_content_report`](#resolve_content_report) | `jsonb` | admin | SD |
| [`resolve_match_conflict`](#resolve_match_conflict) | `void` | `can_manage` | SD |
| [`respond_challenge_invite`](#respond_challenge_invite) | `void` | convidado pendente | SD |
| [`revoke_organizer_role`](#papéis-de-professor) | `void` | admin | SD |
| [`start_official_championship`](#start_official_championship) | `uuid` | `can_manage` | SD |
| [`swap_bracket_participants`](#swap_bracket_participants) | `void` | `can_manage` | SD |
| [`unregister_push_device`](#unregister_push_device) | `boolean` | logado | SD |
| [`update_official_championship`](#update_official_championship) | `uuid` | `can_manage` | SD |
| [`update_player_category`](#update_player_category) | `void` | organizador ou admin | SD |

---

## Termos e conta

### accept_terms

`accept_terms() → timestamptz`

Grava `profiles.terms_accepted_at = now()` para o usuário logado e devolve a data. Se já
havia aceite, mantém a data original (idempotente).

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |

A exclusão de conta não é RPC: é a Edge Function `delete-account` (ver [auth.md](auth.md)).

## Criação e gestão de campeonatos

### create_championship

`create_championship(_c jsonb) → uuid`

Cria liga, eliminatória ou grupos+eliminatória numa transação e devolve o id.

Campos de `_c`:

| Campo | Tipo | Padrão / regra |
|---|---|---|
| `id` | uuid | opcional. Com ele, a chamada é idempotente: se o campeonato já existe e é do mesmo usuário, devolve o id; se é de outro, dá erro |
| `name` | text | obrigatório (é aparado) |
| `format` | text | `liga` \| `eliminatoria` \| `grupos_elim` |
| `unit` | text | `player` (padrão) \| `pair` |
| `status` | text | `rascunho` (padrão) \| `ativo`. `ativo` gera os jogos na hora |
| `is_official` | bool | padrão `false`; `true` exige organizador/admin |
| `start_date`, `end_date` | `YYYY-MM-DD` | opcionais |
| `description`, `venue_id` | text, uuid | opcionais |
| `allow_draw` | bool | padrão `false`; sempre `false` em `eliminatoria` |
| `has_third_place` | bool | padrão `false`; ignorado em `liga` |
| `points_win`, `points_draw`, `points_loss` | int | padrão 3 / 1 / 0; `points_draw` vira 0 se não há empate |
| `tiebreakers` | text[] | padrão `["sets_ganhos","pontos_ganhos","pontos_sofridos_asc"]` |
| `stage` | objeto de fase | liga e eliminatória |
| `num_groups` | int | grupos+elim: obrigatório, ≥ 1 |
| `groups_stage`, `elim_stage` | objeto de fase | grupos+elim |
| `participants` | `[{ user_ids: uuid[], seed?: int, group_index?: int }]` | na ordem de cadastro. `user_ids` com 1 jogador (`player`) ou 2 (`pair`) |

Objeto de fase: `{ counting: "set"|"tempo", rounds, sets_to_play, points_per_set,
win_by_two, set_draw_enabled, time_minutes }`. Padrões: `set`, 1, 3, 11, `true`, `false`,
`null`. Em fase eliminatória, `rounds = 1` e `set_draw_enabled = false` sempre.

Comportamento:

- Oficial de grupos+elim: força `unit = 'player'` e `status = 'rascunho'`. Os grupos são
  criados vazios e a distribuição é feita no início (`start_official_championship`).
- Grupos+elim não oficial: o participante vai para o grupo `group_index` (base 0) ou, sem
  ele, a distribuição é em zigue-zague (1, 2, …, N, N, …, 1) na ordem enviada.
- Fases criadas: liga = `Liga`; eliminatória = `Eliminatória`; grupos+elim = `Grupos`
  (ordering 1) e `Eliminatórias` (ordering 2). Grupos com nome `A`, `B`, `C`…

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |
| `id de campeonato ja usado` | `id` de outro usuário |
| `Informe o nome do campeonato.` | nome vazio |
| `formato invalido: <formato>` | formato fora da lista |
| `unidade invalida: <unidade>` | unidade fora de `player`/`pair` |
| `status invalido: <status>` | status fora de `rascunho`/`ativo` |
| `Apenas organizadores podem criar campeonatos oficiais.` | `is_official` sem papel |
| `numero de grupos invalido` | grupos+elim com `num_groups < 1` |
| `participante com numero de jogadores invalido` | `user_ids` com quantidade errada |
| `minimo 2 jogadores` | grupos+elim não oficial com menos de 2 participantes |

Erros dos gatilhos e da geração também podem aparecer (ver o fim desta página).

### create_challenge

`create_challenge(_c jsonb) → uuid`

Cria um desafio (`format = 'desafio'`, fase única `Fase única` do tipo `liga`).

Campos de `_c`: `id` (opcional, idempotente como acima), `type` (`1v1` | `duplas` |
`times`), `name`, `points_win` (3), `points_draw` (1), `points_loss` (0), `tiebreakers`,
`venue_id`, `stage` (objeto de fase), mais:

- `1v1`: `opponent_id`. O criador entra confirmado e o oponente **pendente**. O desafio
  fica em rascunho até o aceite (`respond_challenge_invite`).
- `duplas`: `partner_id`, `opponent_ids` (2 uuids). As duas duplas entram confirmadas e o
  desafio é ativado na hora.
- `times`: `team_a` e `team_b` = `{ team_id, name, player_ids: uuid[] }`; `has_final`
  (bool). Cada jogador vira um participante ligado ao seu lado. O desafio é ativado na hora,
  com jogos cruzados entre os times.

`allow_draw` = `stage.counting == "tempo"` ou `stage.set_draw_enabled`. Sem empate,
`points_draw` é gravado como 0.

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |
| `id de campeonato ja usado` | `id` de outro usuário |
| `tipo de desafio invalido: <tipo>` | `type` fora da lista |
| `Informe o nome do desafio.` | nome vazio |
| `Selecione um oponente.` | 1v1 sem oponente |
| `Você não pode desafiar a si mesmo.` | oponente = você |
| `Não é possível desafiar este jogador.` | bloqueio entre vocês (qualquer sentido) |
| `Selecione 4 jogadores distintos (você, seu parceiro e a dupla adversária).` | duplas incompletas ou repetidas |
| `Escolha dois times diferentes.` | `team_id` igual nos dois lados |
| `Selecione os jogadores dos dois times.` | lado sem jogadores |
| `Os dois times precisam ter a mesma quantidade de jogadores.` | lados com tamanhos diferentes |
| `Um jogador não pode estar nos dois times.` | jogador repetido |

### import_championship

`import_championship(_c jsonb) → uuid`

Grava de uma vez um campeonato criado e jogado **offline**, com os IDs do aparelho. O
formato completo do JSON está em [placar-offline.md](placar-offline.md#import_championship).

| Erro | Quando |
|---|---|
| `nao autenticado` | sem sessão |
| `id do campeonato obrigatorio` | sem `id` |
| `id de campeonato ja usado` | `id` de outro usuário (do mesmo usuário: devolve o id, idempotente) |
| `formato invalido para importacao: <formato>` | fora de `liga`/`eliminatoria`/`grupos_elim`/`desafio` |
| `unidade invalida para desafio importado: <unidade>` | desafio com unidade fora de `pair`/`team` (1v1 não é importável) |
| `unidade invalida para importacao: <unidade>` | campeonato com unidade fora de `player`/`pair` |
| `grupo aponta para fase de outro campeonato` | `groups[].stage_id` inválido |
| `desafio por times precisa de exatamente 2 times` | `unit = team` sem 2 times |
| `participante aponta para grupo de outro campeonato` | `participants[].group_id` inválido |
| `participante aponta para time de outro campeonato` | `participants[].team_id` inválido |
| `jogo aponta para fase ou participante de outro campeonato` | referência cruzada nos jogos |
| `avanco de chave aponta para jogo de outro campeonato` | `winner_advances_to` inválido |

O campeonato importado nunca é oficial (`is_official = false`).

### add_participant

`add_participant(_championship_id uuid, _user_id uuid) → uuid` (id do participante)

O organizador inclui um jogador já confirmado. Só funciona em rascunho.

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |
| `Campeonato não encontrado.` | id inexistente |
| `Sem permissão para gerenciar este campeonato.` | sem `can_manage` |
| `Jogador já inscrito neste campeonato.` | já é membro de um participante |
| `lista travada: volte o campeonato para rascunho para editar participantes` | campeonato fora do rascunho (gatilho) |

### request_enrollment

`request_enrollment(_championship_id uuid) → uuid` (id do participante pendente)

O jogador pede inscrição num campeonato oficial. Entra com `enrollment_source = 'jogador'`
e status `pendente`. A aprovação e a recusa são escrita direta (ver [telas.md](telas.md)).

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |
| `Campeonato não encontrado.` | id inexistente |
| `Inscrição disponível apenas em campeonatos oficiais.` | `is_official = false` |
| `As inscrições deste campeonato estão fechadas.` | status ≠ `rascunho` |
| `Este campeonato não aceita inscrição individual.` | `unit` ≠ `player` |
| `Você já está inscrito neste campeonato.` | já tem participante (qualquer status) |

### start_official_championship

`start_official_championship(_championship_id uuid) → uuid`

Apaga as inscrições ainda pendentes. Em grupos+elim, distribui os confirmados nos grupos em
zigue-zague (ordem: `seed`, os sem seed por último, depois `created_at`). Por fim, ativa o
campeonato, e o gatilho gera os jogos.

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |
| `Campeonato não encontrado.` | id inexistente |
| `Sem permissão para gerenciar este campeonato.` | sem `can_manage` |
| `O campeonato já foi iniciado.` | status ≠ `rascunho` |
| `É preciso ao menos 2 jogadores confirmados.` | menos de 2 confirmados |
| `Fase de grupos não encontrada.` | grupos+elim sem fase `grupos` |
| `Nenhum grupo configurado.` | grupos+elim sem grupos |

### update_official_championship

`update_official_championship(_id uuid, _p jsonb) → uuid`

Edita um campeonato oficial ainda em rascunho. Campos de `_p`: `name`, `description`,
`venue_id`, `start_date`, `end_date`, `points_win`, `points_draw`, `points_loss`,
`allow_draw`, `has_third_place`, `stages: [{ id, counting, rounds, sets_to_play,
points_per_set, win_by_two, set_draw_enabled, time_minutes }]` e `num_groups`.

- `name`, `description`, `venue_id` e as datas são sempre sobrescritos (ausente = `null`).
- Pontuação: o que não vier mantém o valor atual. Sem `allow_draw`, `points_draw = 0`.
- Só atualiza fases deste campeonato. `time_minutes` ausente vira `null`.
- Grupos+elim: se `num_groups` mudar, apaga os grupos, recria vazios e tira os jogadores
  dos grupos.

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |
| `Campeonato não encontrado.` | id inexistente |
| `Sem permissão para gerenciar este campeonato.` | sem `can_manage` |
| `Apenas campeonatos oficiais podem ser editados aqui.` | não oficial |
| `Só é possível editar antes do início.` | status ≠ `rascunho` |

### Legado: create_liga_championship e create_grupos_elim_championship

Assinaturas posicionais antigas, ainda executáveis, mas **o app web não as usa** (usa
`create_championship`). Não usar no iOS.

- `create_liga_championship(_name text, _points_win int, _points_draw int, _points_loss int,
  _allow_draw bool, _tiebreakers text[], _stage_counting text, _rounds int,
  _sets_to_play int, _points_per_set int, _win_by_two bool, _set_draw_enabled bool,
  _time_minutes int, _player_ids uuid[], _status text = 'rascunho') → uuid`. Erro:
  `usuario nao autenticado`.
- `create_grupos_elim_championship(_name, _num_groups, _qualifiers_per_group, _points_win,
  _points_draw, _points_loss, _allow_draw, _tiebreakers, _groups_counting, _groups_rounds,
  _groups_sets_to_play, _groups_points_per_set, _groups_win_by_two,
  _groups_set_draw_enabled, _groups_time_minutes, _elim_counting, _elim_sets_to_play,
  _elim_points_per_set, _elim_win_by_two, _elim_set_draw_enabled, _elim_time_minutes,
  _has_third_place, _player_ids uuid[], _seeds int[]) → uuid`. Erros:
  `usuario nao autenticado`, `minimo 2 jogadores`. Cria uma fase `Repescagem`
  (`triangular`) quando o total de classificados é ímpar.

### swap_bracket_participants

`swap_bracket_participants(_championship_id uuid, _match_id_a uuid, _side_a text, _match_id_b uuid, _side_b text) → void`

Troca dois lados (`'a'` ou `'b'`; qualquer outro valor conta como `'b'`) entre partidas da
chave antes de ela começar.

| Erro | Quando |
|---|---|
| `não autorizado` | sem `can_manage` |
| `não é possível rearranjar: partidas já iniciadas` | alguma partida com `bracket_slot > 0` fora de `agendado` |

### generate_team_challenge_final

`generate_team_challenge_final(_championship_id uuid) → uuid` (id da final)

Desafio por times com `has_final`: cria a final (`round = 999`, `bracket_slot = -1`) entre o
melhor de cada time (maior `sets_ganhos`, depois maior `pontos_favor`).

| Erro | Quando |
|---|---|
| `sem permissao` | sem `can_manage` |
| `este desafio nao tem final configurada` | `has_final = false` |
| `final ja gerada` | já existe partida com `bracket_slot = -1` |

### respond_challenge_invite

`respond_challenge_invite(_championship_id uuid, _accept boolean) → void`

O convidado pendente de um desafio aceita ou recusa. Aceite: fica `confirmado` e, com 2 ou
mais confirmados, o desafio é ativado e os jogos são gerados. Recusa: fica `recusado` e o
desafio é **encerrado**.

| Erro | Quando |
|---|---|
| `convite nao encontrado para este usuario` | sem participante pendente seu neste desafio |

### update_player_category

`update_player_category(_target_user_id uuid, _category_id uuid) → void`

Muda a categoria de um jogador. `_category_id = null` tira a categoria.

| Erro | Quando |
|---|---|
| `não autorizado` | quem chama não é organizador nem admin |

## Partida e placar

Fluxo, fila e conflito em [placar-offline.md](placar-offline.md). Regras de pontuação em
[regras.md](regras.md).

### apply_match_ops

`apply_match_ops(_match_id uuid, _ops jsonb, _base jsonb = null, _local jsonb = null, _device_id text = null) → jsonb`

Aplica a fila de placar de uma partida numa só chamada, com a partida travada
(`select … for update`).

| Retorno | Quando |
|---|---|
| `{"status":"missing"}` | a partida não existe |
| `{"status":"conflict"}` | a partida já está em `revisao` |
| `{"status":"conflict","games":[…]}` | conflito real e quem chama tem `can_manage`: a partida vai para `revisao` |
| `{"status":"ok","applied":n,"rejected":[{"ids":[…],"error":"…"}],"games":[…]}` | aplicado. Cada operação que falha é desfeita sozinha e entra em `rejected`, com o `sqlerrm` |

`games` = estado final de `match_games`: `[{game_number, score_a, score_b}]`, por
`game_number`.

| Erro (a chamada inteira) | Quando |
|---|---|
| `nao autenticado` | sem sessão |
| `sem permissao para lancar o placar desta partida` | sem `can_manage` e sem ser participante |

Erro dentro de uma operação (vai para `rejected`): `operacao desconhecida: <tipo>`, ou a
mensagem da RPC de encerramento chamada.

### Encerramento de partida

Todas devolvem `void`, gravam `status = 'finalizado'` e limpam
`conflict_server_snapshot`. As versões **sem** sufixo exigem `can_manage`; as versões
`_by_participant` exigem ser participante da partida.

| RPC | Parâmetros | Efeito |
|---|---|---|
| `finalize_match_manual` | `_match_id, _result` (`lado_a`\|`lado_b`\|`empate`) | grava o resultado, mantém o placar |
| `finalize_match_by_participant` | idem | idem |
| `finalize_match_wo` | `_match_id, _winner` (`lado_a`\|`lado_b`) | apaga os games; `is_wo = true` |
| `finalize_match_wo_by_participant` | idem | idem |
| `finalize_match_dq` | `_match_id, _winner` | desclassificação: apaga os games; `is_wo = false` (conta como vitória normal, sem sets nem pontos) |
| `finalize_match_dq_by_participant` | idem | idem |
| `finalize_match_double_wo` | `_match_id` | apaga os games; `result = null`, `is_wo = true`, `is_double_wo = true` |
| `finalize_match_double_wo_by_participant` | `_match_id` | idem |

Mensagens:

| Erro | RPC |
|---|---|
| `partida nao encontrada` | `finalize_match_manual`, `_wo`, `_dq`, `_double_wo` |
| `sem permissao: apenas organizador ou admin pode finalizar` | `finalize_match_manual` |
| `sem permissao: apenas organizador ou admin pode decretar W.O.` | `finalize_match_wo` |
| `sem permissao: apenas organizador ou admin pode desclassificar` | `finalize_match_dq` |
| `sem permissao: apenas organizador ou admin pode decretar W.O. duplo` | `finalize_match_double_wo` |
| `sem permissao: apenas participantes da partida podem encerrar` | `finalize_match_by_participant` |
| `sem permissao: apenas participantes da partida podem decretar W.O.` | `finalize_match_wo_by_participant` |
| `sem permissao: apenas participantes da partida podem desclassificar` | `finalize_match_dq_by_participant` |
| `sem permissao: apenas participantes da partida podem decretar W.O. duplo` | `finalize_match_double_wo_by_participant` |
| `resultado invalido: use lado_a, lado_b ou empate` | `_manual`, `_by_participant` |
| `vencedor invalido: use lado_a ou lado_b` | `_wo*`, `_dq*` |
| `W.O. duplo nao e permitido em partida de mata-mata` | `_double_wo*` com `bracket_slot` ≠ 0/null |

Na versão de participante, a checagem de permissão vem **antes** da de existência: partida
inexistente dá o erro de permissão.

### reopen_match_by_participant

`reopen_match_by_participant(_match_id uuid) → void`

Volta a partida para `em_andamento` (`result = null`, `is_wo = false`, o que também zera
`is_double_wo`) e reabre o campeonato se estava encerrado. Não exige que a partida esteja
finalizada. O organizador reabre por escrita direta em `matches` ou pela operação
`reopen` de `apply_match_ops`.

| Erro | Quando |
|---|---|
| `partida nao encontrada` | id inexistente |
| `sem permissao: apenas participantes da partida podem reabrir` | não é participante |

### reset_match_data

`reset_match_data(_match_id uuid) → void`

"Limpar a partida": apaga os games e volta para `agendado` (`result`, `is_wo`,
`duration_seconds` e `conflict_server_snapshot` zerados). Reabre o campeonato se estava
encerrado.

| Erro | Quando |
|---|---|
| `partida nao encontrada` | id inexistente |
| `sem permissao: apenas participantes ou organizador podem limpar a partida` | sem `can_manage` e sem ser participante |

### flag_match_conflict

`flag_match_conflict(_match_id uuid, _server_snapshot jsonb) → void`

Põe a partida em `revisao` e guarda o snapshot (`{"games":[…]}`). Usada só no envio ação a
ação (sem `apply_match_ops`).

| Erro | Quando |
|---|---|
| `sem permissao` | sem `can_manage` |

### resolve_match_conflict

`resolve_match_conflict(_match_id uuid, _chosen_side text) → void`

`_chosen_side = 'server'`: regrava os games a partir do snapshot. Qualquer outro valor (o
web manda `'local'`) mantém os games atuais. Nos dois casos a partida vai para
`em_andamento`, o snapshot é limpo e `resolve_match` recalcula o resultado.

| Erro | Quando |
|---|---|
| `sem permissao` | sem `can_manage` |
| `snapshot nao encontrado` | `'server'` sem snapshot guardado |

## Classificação e ranking

### get_standings e get_group_standings

`get_standings(_championship_id uuid) → table`
`get_group_standings(_championship_id uuid) → table`

Colunas (iguais nas duas): `position int`, `participant_id uuid`, `display_name text`,
`pontos int`, `v int`, `e int`, `d int`, `sets_ganhos int`, `sets_perdidos int`,
`sets_empatados int`, `pontos_favor int`, `pontos_contra int`, `saldo_pontos int`.

- Só participantes `confirmado`.
- `pontos = v·points_win + e·points_draw + d·points_loss` do campeonato.
- Ordem: `pontos desc`, depois os `tiebreakers` do campeonato na ordem gravada
  (`sets_ganhos desc`, `pontos_favor desc`, `pontos_contra asc`) e, por fim,
  `display_name asc`. `position` é contínua (sem empate de posição).
- `display_name`: o `participants.display_name` ou os nomes dos membros unidos por `" / "`
  (`'Jogador'` quando vazio).
- `get_standings` soma **todas** as partidas do campeonato. `get_group_standings` soma só
  as partidas de fases `grupos`; a posição é global, e o app separa por grupo usando
  `participants.group_id`.
- Campeonato inexistente: nenhuma linha (sem erro).

### get_rankings

`get_rankings(p_category_id uuid = null) → table(user_id uuid, full_name text, avatar_url text, category_id uuid, category_name text, points int, game_points int, bonus_points int, wins int, losses int, played int, set_balance int, rank bigint)`

Ranking geral. Com `p_category_id`, filtra pela categoria do perfil. Regras de pontuação em
[regras.md](regras.md#ranking). Só entra quem jogou ou tem bônus. Ordem:
`points desc, set_balance desc, wins desc`.

O web chama sem filtro, pelo servidor e em cache de 2 min. O iOS pode chamar logado.

## Mensagens

### get_my_conversations

`get_my_conversations() → table(conversation_id uuid, kind text, title text, championship_id uuid, last_read_at timestamptz, last_body text, last_at timestamptz, last_sender_id uuid, unread_count int, other_user_id uuid, other_name text, other_avatar text)`

Conversas do usuário, da mais recente para a mais antiga (sem mensagem = no fim).
`unread_count` conta mensagens de outros depois de `last_read_at`. Conversas diretas com
bloqueio (qualquer sentido) não aparecem. `other_*` só é preenchido em conversa direta.

### get_unread_total

`get_unread_total() → int`

Total de mensagens não lidas, sem contar conversas diretas com bloqueio.

### get_or_create_direct_conversation

`get_or_create_direct_conversation(_other_user_id uuid) → uuid`

Devolve a conversa direta existente com a pessoa ou cria uma nova (com os dois como
membros).

| Erro | Quando |
|---|---|
| `usuario invalido` | sem sessão ou `_other_user_id` = você |
| `Não é possível conversar com este usuário.` | bloqueio em qualquer sentido |

### is_conversation_member

`is_conversation_member(_conversation_id uuid) → boolean`. Você é membro? Usada pelo RLS.

### conversation_blocked

`conversation_blocked(_conversation_id uuid) → boolean`. Conversa **direta** com bloqueio em
qualquer sentido. Com `true`, `messages` recusa o `INSERT`.

## Bloqueio e moderação

### blocked_with

`blocked_with(_other uuid) → boolean`. Há bloqueio entre você e `_other` em qualquer sentido.

### i_blocked

`i_blocked(_other uuid) → boolean`. **Você** bloqueou `_other`.

### post_blocked

`post_blocked(_post_id uuid) → boolean`. Há bloqueio com o autor do post (`false` se o post não
existe).

Denunciar e bloquear não são RPCs: são `INSERT` em `content_reports` e `user_blocks` (ver
[telas.md](telas.md)).

### get_content_reports

`get_content_reports(_status text = null) → table(id uuid, target_type text, target_id uuid, reason text, details text, status text, created_at timestamptz, resolved_at timestamptz, reporter_id uuid, reporter_name text, target_user_id uuid, target_user_name text, preview text, target_exists boolean, open_on_target int)`

Denúncias para o painel admin. `_status` filtra (`aberta`, `resolvida`, `descartada`). Ordem:
abertas primeiro, depois as mais recentes. `preview`: texto do post (`[foto]` se só tem
imagem; o link se só tem link), do comentário, da mensagem ou o nome do perfil.
`open_on_target`: quantas denúncias abertas há no mesmo alvo.

| Erro | Quando |
|---|---|
| `Acesso restrito a administradores.` | não é admin |

### resolve_content_report

`resolve_content_report(_report_id uuid, _action text) → jsonb`

- `descartar`: fecha só esta denúncia (`descartada`). Retorna `{"status":"descartada"}`.
- `remover`: apaga o post, o comentário ou a mensagem e fecha **todas** as denúncias abertas
  do mesmo alvo (`resolvida`). Retorna `{"status":"resolvida","image_path":<texto|null>}`.
  A imagem do post no Storage **não** é apagada pela RPC: o web apaga depois com a chave de
  serviço.

| Erro | Quando |
|---|---|
| `Acesso restrito a administradores.` | não é admin |
| `acao invalida: <acao>` | fora de `remover`/`descartar` |
| `Denúncia não encontrada.` | id inexistente |
| `Esta denúncia já foi analisada.` | status ≠ `aberta` |
| `Perfil não é removido por aqui: use a exclusão de conta na tela de usuários.` | `remover` em denúncia de perfil |

## Papéis

### has_role e is_organizer_or_admin

`has_role(_user_id uuid, _role app_role) → boolean`
`is_organizer_or_admin(_user_id uuid) → boolean`

### can_manage_championship

`can_manage_championship(_championship_id uuid) → boolean`. Organizador, admin ou criador.
**Atenção:** organizador e admin gerenciam **qualquer** campeonato.

### Papéis de professor

Só admin. Todas devolvem `void`.

| RPC | Efeito | Erros |
|---|---|---|
| `approve_organizer_request(target_user_id uuid)` | pedido `pending` → `approved` e concede `organizer` | `apenas admin pode aprovar`; `solicitacao nao encontrada ou ja revisada` |
| `reject_organizer_request(target_user_id uuid)` | pedido `pending` → `rejected` | `apenas admin pode rejeitar`; `solicitacao nao encontrada ou ja revisada` |
| `grant_organizer_role(target_user_id uuid)` | concede `organizer` (e aprova o pedido pendente, se houver) | `apenas admin pode conceder professores` |
| `revoke_organizer_role(target_user_id uuid)` | remove `organizer` e apaga o pedido | `apenas admin pode remover professores`; `voce nao pode remover seu proprio papel` |

## Push no iOS

### register_push_device

`register_push_device(_token text, _environment text) → uuid`

Registra (ou transfere para o usuário atual) o token APNs do aparelho. O token é aparado e
convertido para minúsculas. Se o token já existe, atualiza `user_id` e `environment` e
limpa `last_error`.

| Erro | Quando |
|---|---|
| `Usuário não autenticado.` | sem sessão |
| `Token de aparelho inválido.` | não casa com `^[0-9a-f]{64,200}$` (depois de aparar e converter) |
| `Ambiente inválido: <ambiente>` | fora de `sandbox`/`production` |

### unregister_push_device

`unregister_push_device(_token text) → boolean`. Remove o token do usuário atual (no logout).
`true` se removeu. Erro: `Usuário não autenticado.`

## Comunidade

### get_community_feed

`get_community_feed(_limit int = 20, _offset int = 0) → table(id uuid, author_id uuid, body text, image_path text, embed_url text, embed_provider text, created_at timestamptz, author_name text, author_avatar text, like_count bigint, comment_count bigint, liked boolean)`

Posts mais recentes primeiro. `_limit` fica entre 1 e 50; `_offset ≥ 0`. É `security
invoker`: o RLS esconde posts de autores com bloqueio. Os contadores contam curtidas e
comentários sem filtrar bloqueio. `image_path` é o caminho no bucket `community`; a URL
pública é montada pelo cliente.

---

## Erros que vêm dos gatilhos

Podem aparecer em escritas diretas ou em RPCs:

| Mensagem | Origem |
|---|---|
| `lista travada: volte o campeonato para rascunho para editar participantes` | insert/update em `participants` fora do rascunho |
| `Formato e pontuação só podem ser alterados com o campeonato em rascunho.` | update em `championships` (formato, unidade, pontos, empate, desempates, 3º lugar, final) fora do rascunho |
| `Apenas organizadores podem alterar se o campeonato é oficial.` | mudar `is_official` sem papel |
| `As regras da fase só podem ser alteradas com o campeonato em rascunho.` | update em `championship_stages` fora do rascunho |
| `nao e possivel voltar para rascunho: ha jogo realizado` | `ativo → rascunho` com partida finalizada |
| `campeonato ja iniciado: nao e possivel regenerar os jogos` | geração de jogos com partida finalizada |
| `Conteúdo não encontrado.` | denúncia de alvo inexistente (mensagem: só de conversa da qual você é membro) |
| `Você não pode denunciar o próprio conteúdo.` | denúncia do próprio conteúdo |
