# Telas

Para cada tela: o que o web lê e grava hoje no Supabase. A notação segue o PostgREST e o
supabase-js:

- `select` com tabelas aninhadas = embed por chave estrangeira;
- `!inner` = join interno;
- `table!fk(...)` = embed por uma FK específica.

Os campos e filtros foram copiados do código (arquivo indicado em cada tela).

"Escrita direta" = `insert`/`update`/`delete` na tabela, autorizado pelo RLS (ver
[modelo.md](modelo.md#políticas-de-rls-resumo)). As RPCs estão em [rpcs.md](rpcs.md).

Realtime (ver [modelo.md](modelo.md#realtime)): só `messages`, `notifications`,
`conversations` e `conversation_members` emitem eventos.

---

## Login e cadastro

`src/app/login/page.tsx`, `src/app/auth/callback/route.ts`. Detalhes em [auth.md](auth.md).

- **Modos:** `Entrar`, `Criar conta`, `Redefinir senha`.
- **Auth:** `signUp` (com `data.terms_accepted = true`), `signInWithPassword`,
  `signInWithOtp` (link mágico), `resetPasswordForEmail`; no retorno,
  `exchangeCodeForSession` ou `verifyOtp`.
- **Tabelas:** nenhuma. O gatilho `handle_new_user` cria o perfil.
- **Validação:**
  - e-mail com `@` e mais de 3 caracteres;
  - cadastro: senha de 8 ou mais e aceite dos termos;
  - entrar: senha não vazia.
- **Telas de confirmação:** `Verifique seu e-mail` (link mágico), `Confirme seu e-mail`
  (cadastro com confirmação) e `Link enviado!` (redefinição).
- **Erros:** tabela em [auth.md](auth.md#mensagens-de-erro). Falha no callback →
  `/login?error=auth`.

## Termos e aceite

`src/app/termos/page.tsx` (pública), `src/app/termos/aceitar/*`.

- **Leitura:** `profiles.select('terms_accepted_at').eq('id', eu).single()`. Se já aceitou,
  volta para `/`.
- **RPC:** `accept_terms()`.
- **Texto:** `TermsContent` (11 seções, atualizado em 9 de outubro de 2026), com links para
  `/privacidade` e `/ajuda`.
- **Erro:** `Não foi possível registrar o aceite. Tente de novo.`
- **Quando aparece:** o app redireciona para cá enquanto `terms_accepted_at` for `null`
  (depois do onboarding).

## Onboarding

`src/app/onboarding/page.tsx`, `OnboardingForm.tsx`.

- **Leitura:**
  - `profiles.select('onboarding_completed').eq('id', eu)`; se já concluiu, vai para `/`;
  - `profiles_private.select('email').eq('user_id', eu)` (exibido);
  - `categories.select('id, name').order('name')`;
  - `teams.select('id, name').order('name')`.
- **Storage:** `avatars.upload('<uid>/avatar.jpg', jpeg, { upsert: true })` →
  `getPublicUrl` → `profiles.avatar_url`.
- **Escrita direta:**
  - `profiles.update({ full_name, birth_date|null, gender, avatar_url?, category_id|null, team_id|null, onboarding_completed: true }).eq('id', eu)`;
  - com telefone: `profiles_private.update({ phone }).eq('user_id', eu)`.
- **Regras:** [regras.md](regras.md#onboarding).
- **Erros:**
  - `Não foi possível processar a imagem. Tente outra.`
  - `Erro ao fazer upload da foto.`
  - `Erro ao salvar perfil.`
  - `Erro ao salvar telefone.`

## Início

`src/app/(app)/page.tsx`, `src/components/home/*`, `src/lib/cached-public-data.ts`. Seções
na ordem: saudação, banner de instalação (PWA), Lembretes, Patrocinadores, Em andamento,
Ranking e Comunidade.

- **Saudação:** `profiles.select('full_name, gender, birth_date, avatar_url').eq('id', eu)`.
- **Lembretes:**
  - `rpc get_unread_total()`;
  - convites e inscrições:
    `participant_members.select('participants!inner(enrollment_status, championships!inner(id, name, format, status, participants(participant_members(user_id, profiles(full_name)))))').eq('user_id', eu)`.
    Daí saem: convites de desafio pendentes (com o nome do desafiante), inscrições pendentes
    em campeonato e a quantidade de campeonatos ativos em que estou confirmado;
  - respostas aos meus desafios:
    `championships.select('id, name, participants(enrollment_status, participant_members(user_id, profiles(full_name)))').eq('format','desafio').eq('created_by', eu).in('status',['rascunho','ativo'])`;
  - aniversário: cartão quando o dia e o mês de `birth_date` (UTC) são hoje;
  - textos como `mensagem não lida` / `mensagens não lidas`.
- **Patrocinadores** (servidor, cache de 10 min):
  - `storage.from('sponsors').list('', { limit: 100, sortBy: name asc })` (logado pode
    listar);
  - links: `sponsor_banners.select('image_name, link_url')`;
  - imagem: URL pública do bucket `sponsors`.
- **Em andamento:**
  - `championships.select('id, name, format').eq('status','ativo').order('created_at', desc).limit(12)`;
  - partidas ao vivo:
    `matches.select('id, championship_id, championships(name, format), side_a:participants!matches_side_a_participant_id_fkey(participant_members(user_id, profiles(full_name))), side_b:participants!matches_side_b_participant_id_fkey(...)').eq('status','em_andamento').limit(6)`.
- **Ranking:** `rpc get_rankings()` (no web, pelo servidor e em cache de 2 min; o iOS pode
  chamar logado), sem filtro.
  - As abas são `Geral` e as categorias que aparecem nas linhas do ranking, na ordem de
    aparição. Não há consulta a `categories`.
  - Filtrar por categoria re-numera as posições na tela.
  - Vazio: `Nenhuma partida computada nesta categoria.`
- **Comunidade (feed):**
  - `rpc get_community_feed({ _limit: 20, _offset: 0 })`;
  - `user_roles.select('role').eq('user_id', eu)` (admin pode apagar qualquer post);
  - foto: URL pública de `community/<image_path>`.
  Vazio: `Ainda não há publicações. Seja o primeiro a compartilhar algo!`
  - Publicar:
    1. upload opcional em `community/<uid>/<uuid>.jpg`;
    2. `community_posts.insert({ author_id: eu, body|null, image_path|null, embed_url|null, embed_provider|null })`;
    3. se o insert falhar, apaga a foto enviada.
    Links do YouTube e do Instagram são detectados no texto (`Vídeo do YouTube`,
    `Post do Instagram`). Até 2000 caracteres. Placeholder:
    `Compartilhe algo com a comunidade…`.
  - Apagar post: `community_posts.delete().eq('id')` e depois
    `storage.from('community').remove([image_path])`.
  - Curtir: `community_post_likes.insert({ post_id, user_id: eu })`. Descurtir:
    `.delete().eq('post_id').eq('user_id', eu)`.
  - Comentários:
    `community_post_comments.select('id, post_id, author_id, body, created_at, profiles!community_post_comments_author_id_fkey(full_name, avatar_url)').eq('post_id').order('created_at')`;
    `insert({ post_id, author_id: eu, body })`; `delete().eq('id')`. Vazio:
    `Seja o primeiro a comentar.`; placeholder `Escreva um comentário…`.
  - Denunciar ou bloquear pelo menu ⋯ (ver [Moderação](#moderação-menu--em-posts-comentários-mensagens-e-perfis)).
  - Erros:
    - `Não foi possível processar a imagem.`
    - `Falha ao enviar a foto.`
    - `Não foi possível publicar.`
    - `Erro ao publicar.`
- **Realtime:** nenhum nesta tela (o contador de não lidas da aba usa realtime de
  `messages`).

## Campeonatos

`src/app/(app)/campeonatos/page.tsx`, `CampeonatosListClient.tsx`.

- **Leitura:**
  - `championships.select('id, name, format, status, is_official, created_at').neq('format','desafio').order('created_at', desc)`;
  - meus desafios:
    `participant_members.select('participants!inner(championship_id, enrollment_status, championships!inner(id, name, status, format))').eq('user_id', eu).in('participants.enrollment_status',['confirmado','pendente']).eq('participants.championships.format','desafio')`
    (sem repetição).
- **Seções:** pendentes offline (criações na fila), `Meus desafios` (some se vazio),
  `Oficiais` (verde-cana) e `Campeonatos`.
- **Filtros por formato:** `Todos`, `Liga`, `Grupos + Elim.`, `Eliminatória`.
- **Vazio:** `Nenhum campeonato ainda.`; com filtro, `Nenhum campeonato neste formato.`
- `/desafios` não tem lista própria: redireciona para `/campeonatos`.

## Detalhe do campeonato

`src/app/(app)/campeonatos/[id]/page.tsx`, `ChampionshipDetailClient.tsx`, `BracketView`,
`GroupsView`, `StandingsTable`, `OfficialPanel`.

- **Leitura:**
  - campeonato:
    `championships.select('id, name, format, unit, status, start_date, end_date, allow_draw, has_third_place, is_official, description, venue_id, points_win, points_draw, points_loss, tiebreakers, created_at, created_by, venues(name), championship_stages(id, name, kind, counting, rounds, sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes, groups(id, name, ordering))').eq('id').single()`;
  - partidas:
    `matches.select('id, stage_id, round, bracket_slot, result, status, is_wo, is_double_wo, side_a_participant_id, side_b_participant_id, match_games(game_number, score_a, score_b)').eq('championship_id').order('round').order('created_at')`;
  - participantes:
    `participants.select('id, group_id, enrollment_status, participant_members(user_id)').eq('championship_id').in('enrollment_status',['confirmado','pendente'])`;
  - nomes: `profiles.select('id, full_name, avatar_url').in('id', <membros>)`;
  - `rpc get_standings({ _championship_id })`; em grupos+elim também
    `rpc get_group_standings`;
  - conversa do campeonato:
    `conversations.select('id').eq('championship_id').eq('kind','group').maybeSingle()`;
  - permissão: `rpc can_manage_championship({ _championship_id })`.
- **Abas:**
  - Liga: `Jogos`, `Classificação`, `Estatísticas`.
  - Eliminatória: `Bracket`, `Jogos`, `Estatísticas`.
  - Grupos+elim: `Grupos`, `Bracket`, `Jogos`, `Estatísticas`.
- **Recargas das abas:**
  - Bracket:
    `matches.select('id, round, bracket_slot, result, status, is_wo, side_a_participant_id, side_b_participant_id, match_games(...)').eq('championship_id').order('round').order('created_at')`;
  - Grupos: `rpc get_group_standings` e
    `matches.select('id, status, stage_id, side_a_participant_id, side_b_participant_id').eq('championship_id')`;
  - Classificação: `rpc get_standings`.
- **Ações:**
  - trocar lados na chave antes de começar (organizador): `rpc swap_bracket_participants`;
  - ativar rascunho: `championships.update({ status: 'ativo' }).eq('id').eq('status','rascunho').select('id')`.
    Sem linha atualizada: `O campeonato não está em rascunho.`;
  - excluir: `championships.delete().eq('id')` (em cascata);
  - **oficial:**
    - pedir inscrição: `rpc request_enrollment`;
    - aprovar: `participants.update({ enrollment_status: 'confirmado' }).eq('id')`;
    - recusar: `participants.delete().eq('id')`;
    - incluir jogador: `rpc add_participant`;
    - iniciar: `rpc start_official_championship`.
  - conversa do grupo: abre `/mensagens/<id>`.
- **Realtime:** o web assina `matches` (filtro `championship_id`) e `match_games` (canal
  dinâmico), mas essas tabelas **não estão na publicação**, então nada chega. A tela
  atualiza ao abrir ou recarregar.
- **Vazio:** `Nenhum jogo gerado ainda.`; classificação `Nenhuma partida finalizada ainda.`;
  estatísticas `Sem dados ainda`.

## Criação de campeonato

`src/app/(app)/campeonatos/novo/page.tsx`, `ChampionshipWizard.tsx`,
`src/app/(app)/campeonatos/actions.ts`, `src/lib/offline/players-cache.ts`.

- **Leitura:**
  - `user_roles.select('role').eq('user_id', eu)` (oficial só para organizador/admin);
  - `venues.select('id, name').order('name')`;
  - jogadores:
    `profiles.select('id, full_name, avatar_url, category_id').not('full_name','is',null).order('full_name').limit(300)`;
  - `categories.select('id, name').order('name')`.
- **RPC:** `create_championship(_c)` (liga, eliminatória, grupos+elim). Payload em
  [rpcs.md](rpcs.md#create_championship).
- **Padrões do assistente:** status `ativo` (criar já gera os jogos), desempates
  `sets_ganhos, pontos_ganhos, pontos_sofridos_asc`, pontuação V1/D0 sem empate, 3 sets de
  11 com vantagem de 2.
- **Avisos:**
  - eliminatória com 3 participantes: `3 jogadores: será gerado triangular (todos jogam entre si).`;
  - quantidade fora de potência de 2 → aviso de byes.
- **Offline:** sem rede vai para a fila e aparece como provisório (ver
  [placar-offline.md](placar-offline.md#campeonato-criado-offline)).
- **Erros:** a mensagem da RPC; `Erro ao criar campeonato.`; listas vazias
  `Nenhum jogador disponível.`, `Nenhum jogador cadastrado.`,
  `Nenhum jogador nesta categoria.` e `Nenhum resultado para "<busca>"`.
- **Editar** (`/campeonatos/[id]/editar`):
  - leitura:
    `championships.select('id, name, format, status, is_official, description, venue_id, start_date, end_date, allow_draw, has_third_place, points_win, points_draw, points_loss, championship_stages(id, kind, counting, rounds, sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes, ordering))'`,
    `groups` (contagem `head`) e `venues`;
  - oficial: `rpc update_official_championship`;
  - não oficial: `championships.update({ name, start_date?, points_* (só rascunho) })` e
    `championship_stages.update({ sets_to_play, points_per_set, win_by_two })` (só
    rascunho). Fora do rascunho, os gatilhos recusam pontos e regras de fase.

## Desafios e criação

`src/app/(app)/desafios/*`, `ChallengeWizard.tsx`, `ChallengeDetailClient.tsx`,
`TeamChallengeView.tsx`, `src/app/(app)/desafios/actions.ts`.

- **Criar** (`/desafios/novo`):
  - leitura: `venues.select('id, name').order('name')`; jogadores como na criação de
    campeonato; times: `teams.select('id, name').order('name')` e
    `profiles.select('id, full_name, avatar_url, team_id').not('team_id','is',null).order('full_name')`;
  - RPC `create_challenge(_c)` com `type` `1v1`, `duplas` ou `times` (ver
    [rpcs.md](rpcs.md#create_challenge));
  - vazios: `Nenhum jogador disponível.`;
    `Nenhum time cadastrado. Cadastre times e jogadores na área de Gestão.`; `Nenhum time com pelo menos N jogadores…`;
  - erro: a mensagem da RPC ou `Erro ao criar desafio.`
- **Detalhe** (`/desafios/[id]`):
  - desafio:
    `championships.select('id, name, status, format, unit, has_final, points_win, points_draw, points_loss, tiebreakers, championship_stages(rounds, counting, points_per_set, win_by_two, set_draw_enabled, sets_to_play)').eq('id').in('format',['desafio']).single()`;
  - participantes:
    `participants.select('id, enrollment_status, championship_team_id, participant_members(user_id)').eq('championship_id').order('created_at')`;
  - nomes em `profiles`;
  - partidas como no campeonato (com `round`, `bracket_slot`, `is_wo`, `is_double_wo` e
    games);
  - `rpc can_manage_championship`;
  - times: `championship_teams.select('id, name, ordering').eq('championship_id').order('ordering')`
    e `v_team_standings.select('*').eq('championship_id')`;
  - classificação: `rpc get_standings`.
- **Ações:**
  - responder convite (convidado pendente, 1v1): `rpc respond_challenge_invite({ _championship_id, _accept })`.
    Erro: `Não foi possível responder ao convite. Tente novamente.`;
  - gerar a final (times, com `has_final`): `rpc generate_team_challenge_final`;
  - editar (`/desafios/[id]/editar`): `championships.update({ name })` e, em rascunho,
    `championship_stages.update({ rounds })`;
  - excluir: `championships.delete()`.
- **Vazio:** `Nenhum jogo gerado ainda.`; times: `Sem partidas finalizadas ainda.`
- **Títulos:** `Desafio 1v1`, `Desafio por times · <A> × <B>`.

## Partida e placar

`src/app/(app)/campeonatos/[id]/jogos/[matchId]/page.tsx` (igual em `/desafios/...`),
`ScoreScreen.tsx`, `useScoreEngine.ts`, `SyncEngine.ts`.

- **Leitura:**
  - partida:
    `matches.select('id, status, result, is_wo, is_double_wo, bracket_slot, conflict_server_snapshot, stage_id, scheduled_at, duration_seconds, side_a_participant_id, side_b_participant_id, championship_id, match_games(game_number, score_a, score_b)').eq('id').single()`;
  - fase:
    `championship_stages.select('id, counting, sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes').eq('id', stage_id)`.
    Sem `stage_id`: a primeira fase do campeonato por `created_at`. No desafio, vem embutida
    em `championships`;
  - lados: `participant_members.select('participant_id, user_id').in('participant_id', [A, B])`
    e `profiles.select('id, full_name, avatar_url').in('id', …)`;
  - `rpc can_manage_championship`. Membro de um dos lados também pode lançar.
  - Recarga: `matches.select('status, result, is_wo, is_double_wo, conflict_server_snapshot, match_games(...)').eq('id').single()`.
- **Escrita:** pela fila. Principal: `rpc apply_match_ops`. Alternativa: escrita direta em
  `match_games` (upsert `onConflict: match_id,game_number`, delete), `matches.update`
  (`duration_seconds`, `scheduled_at`; reabrir do organizador) e as RPCs
  `finalize_match_*`, `reopen_match_by_participant`, `reset_match_data` e
  `flag_match_conflict`. Detalhes em [placar-offline.md](placar-offline.md).
- **Conflito** (organizador): `rpc resolve_match_conflict({ _match_id, _chosen_side: 'server'|'local' })`.
- **Data:** ao começar ou terminar sem data, grava hoje às 12:00 (horário do aparelho).
- **Realtime:** canal `score-engine-<matchId>` assinando `match_games` (filtro `match_id`)
  e `matches` (`UPDATE`, filtro `id`). **Não chega nada** (tabelas fora da publicação). O
  estado vem da fila local e das recargas.
- **Textos e erros:**
  - `Nenhum dos dois compareceu — a partida não pontua.`
  - `Não foi possível encerrar a partida.`
  - `Não foi possível desclassificar.`
  - `Não foi possível decretar o W.O.`
  - `Não foi possível reabrir a partida.`
  - `Não foi possível excluir os dados da partida.`
  - `Tempo esgotado · N min — encerre a partida`
  - mensagens das RPCs, como estão.

## Comunidade

`src/app/(app)/comunidade/page.tsx`, `ComunidadeClient.tsx`.

- **Leitura:**
  - `profiles.select('id, full_name, avatar_url, category_id, team_id').eq('onboarding_completed', true).not('full_name','is',null).order('full_name')`;
  - `teams.select('id, name')`;
  - `user_roles.select('user_id, role').eq('role','organizer')` (selo de professor);
  - categorias em cache (`categories.select('id, name').order('name')`).
- **Busca** por nome (no aparelho), com placeholder `Buscar jogador por nome…`.
- Tocar abre `/jogador/<id>?from=comunidade`.
- **Vazio:** `Nenhum jogador encontrado.`
- **Observação:** a lista não esconde jogadores bloqueados (`profiles` é público).

## Jogador

`src/app/(app)/jogador/[id]/page.tsx`, `PlayerMenu`, `PlayerSafety`, `MessageButton`.

- **Leitura:**
  - `profiles.select('id, full_name, avatar_url, category_id, team_id').eq('id').single()`
    (sem perfil: 404);
  - `categories.select('name').eq('id')`, `teams.select('name').eq('id')`;
  - `v_user_lifetime_stats.select('*').eq('user_id').maybeSingle()` (V/E/D, sets;
    aproveitamento = V ÷ (V+E+D));
  - `participant_members.select('participant_id').eq('user_id')` (contagem de campeonatos);
  - bloqueio: `user_blocks.select('blocked_id').eq('blocker_id', eu).eq('blocked_id', id).maybeSingle()`.
- **Ações:**
  - mensagem: `rpc get_or_create_direct_conversation({ _other_user_id })` → `/mensagens/<id>`.
    Erro: `Não foi possível abrir a conversa.`;
  - menu ⋯ (outro jogador, não bloqueado): denunciar perfil ou bloquear;
  - bloqueado: aviso com desbloquear (`user_blocks.delete()`). Erro:
    `Não foi possível desbloquear. Tente de novo.`
- **Vazio:** `Ainda sem partidas finalizadas.`
- **Voltar:** para `Comunidade` (se `?from=comunidade`) ou para `Início`.

## Marketplace

`src/app/(app)/marketplace/page.tsx`, `TeachersSection.tsx`.

- **Professores:** `user_roles.select('user_id').eq('role','organizer')` e
  `profiles.select('id, full_name, avatar_url').in('id', …)`. Tocar abre conversa direta
  (`rpc get_or_create_direct_conversation`). Vazio: `Nenhum professor cadastrado ainda.`
- **Produtos & Serviços:**
  `ads.select('id, name, product_service, phone, email, address').eq('active', true).order('ordering').order('created_at')`
  (no web, servidor e cache). Vazio: `Nenhum anúncio disponível no momento.`

## Mensagens e chat

`src/app/(app)/mensagens/*`, `ConversationList.tsx`, `ChatView.tsx`,
`ReceivedMessageMenu.tsx`.

- **Lista:**
  - `rpc get_my_conversations()` (já sem as conversas diretas bloqueadas);
  - realtime: canal `conv-list-realtime`, `INSERT` em `messages` (sem filtro; o RLS só
    entrega as das minhas conversas) → refaz a RPC.
- **Nova conversa:**
  - busca `profiles.select('id, full_name, avatar_url').ilike('full_name', '%<termo>%').limit(10)`;
  - depois `rpc get_or_create_direct_conversation`;
  - placeholder `Buscar jogador…`; textos `Buscando…` e `Nenhum jogador encontrado.`;
  - erros: `Não foi possível criar a conversa. Tente novamente.`,
    `Resposta inesperada. Tente novamente.`
- **Apagar conversa** (só diretas, no modo edição):
  `conversation_members.delete().eq('conversation_id').eq('user_id', eu)`. A conversa e as
  mensagens continuam para o outro. Se eu voltar a falar com a pessoa,
  `get_or_create_direct_conversation` cria uma conversa nova.
- **Vazio da lista:** `Nenhuma conversa ainda.` · `Toque em "Nova" para começar.`
- **Chat** (`/mensagens/[id]`):
  - leitura:
    - membro? `conversation_members.select('id').eq('conversation_id').eq('user_id', eu).single()`
      (não membro: 404);
    - conversa: `conversations.select('id, kind, title, championship_id').eq('id').single()`;
    - membros: `conversation_members.select('user_id').eq('conversation_id')` e
      `profiles.select('id, full_name, avatar_url').in(...)`;
    - mensagens: `messages.select('id, sender_id, body, created_at').eq('conversation_id').order('created_at', asc).limit(60)`.
      O RLS esconde as de quem eu bloqueei.
  - lido: `conversation_members.update({ last_read_at: now }).eq('conversation_id').eq('user_id', eu)`,
    ao abrir e ao voltar ao app (com `onAppReturn`, no máximo a cada 30 s);
  - enviar: `messages.insert({ conversation_id, sender_id: eu, body }).select('id, created_at').single()`
    (otimista; 1 a 2000 caracteres);
  - realtime: canal `chat-<conversationId>`, `INSERT` em `messages` com filtro
    `conversation_id=eq.<id>`. Ignora o id que já está na tela.
  - grupo do campeonato: selo `Grupo do campeonato`;
  - mensagem recebida: menu para denunciar (`target_type = 'message'`) ou bloquear o
    remetente;
  - vazio: `Nenhuma mensagem ainda.` · `Diga olá! 👋`; placeholder `Mensagem…`;
  - erros: `Não é possível enviar mensagens nesta conversa.` (código `42501`, conversa
    direta com bloqueio) e `Não foi possível enviar. Tente de novo.`
- **Contador da aba:** `rpc get_unread_total()`; realtime em canal
  `unread-<userId>-<instância>` (`INSERT` em `messages`) e recarga ao voltar ao app (com
  `onAppReturn`).

## Notificações

`src/components/NotificationsBell.tsx`. Detalhes em
[push.md](push.md#sino-de-notificações-como-o-web-usa).

- **Leitura:** `notifications.select('id, type, title, body, url, read, created_at').eq('user_id', eu).order('created_at', desc).limit(30)`.
- **Realtime:** canal `notifications-<userId>`, `INSERT` com filtro `user_id=eq.<userId>`.
- **Escrita:** `update({ read: true })` numa notificação ou em todas
  (`.eq('user_id', eu).eq('read', false)`).
- **Recarga:** ao voltar ao app (com `onAppReturn`).
- **Vazio:** `Nenhuma notificação ainda.`

## Perfil e bloqueados

`src/app/perfil/*`.

- **Leitura:**
  - `profiles.select('full_name, birth_date, gender, avatar_url, category_id, team_id').eq('id', eu)`;
  - `profiles_private.select('phone, email').eq('user_id', eu)`;
  - `teams.select('id, name').order('name')`; categorias.
- **Salvar:**
  - foto opcional (`avatars/<uid>/avatar.jpg`, upsert);
  - `profiles.update({ full_name, birth_date|null, gender, category_id|null, team_id|null, avatar_url? }).eq('id', eu)`;
  - `profiles_private.update({ phone|null }).eq('user_id', eu)`;
  - opções vazias: `Sem categoria`, `Sem time`.
- **Senha:** `auth.updateUser({ password })` (ver [auth.md](auth.md)).
- **Bloqueados:**
  - `user_blocks.select('blocked_id, profiles!user_blocks_blocked_id_fkey(full_name, avatar_url)').eq('blocker_id', eu).order('created_at', desc)`;
  - desbloquear: `user_blocks.delete().eq('blocker_id', eu).eq('blocked_id', id)`.
  - Erro: `Não foi possível desbloquear. Tente de novo.`
- **Excluir conta:** web `POST /api/account/delete`; iOS Edge Function `delete-account`.
  Erro: `Não foi possível excluir a conta.`
- **Erros:**
  - `Não foi possível processar a imagem. Tente outra.`
  - `Erro ao enviar a foto.`
  - `Erro ao salvar perfil.`
  - `Erro ao salvar telefone.`

## Ajuda e feedback

`src/app/(app)/ajuda/*`.

- **Conteúdo fixo:** seções `Campeonatos & Desafios`, `Seus desafios e campeonatos`,
  `Placar & Classificação`, `Marketplace`, `Uso offline`, `Comunidade` e `Instalar o app`.
- **Feedback** (server action):
  - `profiles.select('full_name').eq('id', eu)`;
  - `feedback.insert({ user_id: eu, user_name, message, type })`.
  - Tipos: `Bug`, `Sugestão`, `Crítica`, `Geral`.
- **Erros:**
  - `Usuário não autenticado.`
  - `Mensagem muito curta (mínimo 5 caracteres).`
  - `Mensagem muito longa (máximo 1000 caracteres).`
  - `Tipo inválido.`
  - `Erro ao enviar. Tente novamente.`
- Gera uma notificação `feedback` para os admins.

---

## Moderação (menu ⋯ em posts, comentários, mensagens e perfis)

`src/lib/moderation.ts`, `src/components/moderation/*`.

- **Denunciar:**
  `content_reports.insert({ reporter_id: eu, target_type, target_id, reason, details|null })`.
  - Motivos: `Spam`, `Ofensa ou assédio`, `Conteúdo impróprio`, `Perfil falso`, `Outro`.
  - Campo `Detalhes (opcional)`; botão `Enviar denúncia`.
  - `23505` → `Você já denunciou isto. A denúncia está em análise.`; outros erros
    mostram a mensagem do banco (por exemplo, `Você não pode denunciar o próprio conteúdo.`).
- **Bloquear:** `user_blocks.insert({ blocker_id: eu, blocked_id })` (`23505` = já
  bloqueado, tratado como sucesso). Erro: `Não foi possível bloquear. Tente de novo.`

## Busca (barra superior)

`src/components/SearchDropdown.tsx`. Com termo `t` (padrão `%t%`):

- `profiles.select('id, full_name, avatar_url').ilike('full_name', …).limit(5)`;
- `championships.select('id, name, format').ilike('name', …).limit(8)`;
- `participants.select('id, display_name, championship_id, championships(format)').ilike('display_name', …).limit(5)`.

Vazio: `Nada encontrado para "<termo>"`.

## Outras telas (fora da lista pedida)

- **Ser professor** (`/organizador`): lê e cria `organizer_requests` (`insert({ user_id: eu })`)
  e lê `user_roles`.
- **Gestão** (organizador/admin), escrita direta:
  - `categories`, `venues`, `courts`, `teams` e `ads`;
  - `feedback` (`update` de status, `delete`);
  - `rpc update_player_category`.
- **Painel admin:**
  - `rpc get_content_reports`, `rpc resolve_content_report` (a foto do post removido é
    apagada depois com a chave de serviço);
  - `rpc grant_organizer_role`, `revoke_organizer_role`, `approve_organizer_request`,
    `reject_organizer_request`;
  - `sponsor_banners.upsert`;
  - leitura de `profiles_private` e `feedback`.
- **Sincronização** (`/sincronizacao`): só o aparelho (fila, falhas, criações pendentes).
  Vazio: `Nenhum dado pendente neste aparelho.`
