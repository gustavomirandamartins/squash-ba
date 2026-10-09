-- Criação e gestão de campeonatos e desafios por RPC transacional (09/10/2026).
--
-- O app iOS não chama as server actions do Next: toda escrita que dependia
-- delas passa a existir no banco, numa transação só (antes: várias escritas
-- soltas, com "desfazer" manual se uma falhasse no meio).
--
--   • create_championship(_c)  liga, eliminatória e grupos+elim; jogador ou
--                              dupla; oficial (só organizador/admin);
--                              rascunho ou ativo.
--   • create_challenge(_c)     desafio 1v1 (oponente pendente até o aceite),
--                              duplas e times.
--   • add_participant, start_official_championship,
--     update_official_championship — gestão do campeonato oficial.
--
-- As duas de criação aceitam o id vindo do cliente e são idempotentes: o
-- mesmo envio repetido devolve o campeonato já criado; id de outro usuário é
-- erro. Mensagens de erro iguais às das server actions.
--
-- Convenção única (a que a interface exibe certo — ela escreve "Grupo {nome}"):
--   • grupos: nome "A", "B", … e ordering 1, 2, …;
--   • fases: ordering 1 (e 2 para a eliminatória do grupos+elim).
-- Dados antigos não são alterados. create_liga_championship e
-- create_grupos_elim_championship continuam no banco, sem mudança.
--
-- Travas novas (gatilhos BEFORE UPDATE), valem para qualquer caminho de escrita:
--   • championships: só organizador/admin muda is_official; fora do rascunho,
--     formato, unidade, pontuação, empate, desempate, 3º lugar e final não
--     mudam. Status continua livre (reabrir/encerrar pelos gatilhos de sempre).
--   • championship_stages: fora do rascunho, as regras da fase não mudam.
--
-- Permissões no padrão de seguranca_funcoes: funções do app só para
-- autenticados; auxiliares internas e funções de gatilho para ninguém de fora.

-- ── Auxiliares internas ──────────────────────────────────────────────────────

create or replace function public.insert_championship_stage(
  _cid uuid, _name text, _ordering int, _kind text, _s jsonb, _no_draw boolean
)
returns uuid
language sql security definer set search_path = public as $$
  insert into public.championship_stages (
    championship_id, name, ordering, kind, counting, rounds, sets_to_play,
    points_per_set, win_by_two, set_draw_enabled, time_minutes
  ) values (
    _cid, _name, _ordering, _kind,
    coalesce(nullif(_s->>'counting', ''), 'set')::counting_system,
    case when _kind = 'eliminatoria' then 1 else coalesce((_s->>'rounds')::int, 1) end,
    coalesce((_s->>'sets_to_play')::int, 3),
    coalesce((_s->>'points_per_set')::int, 11),
    coalesce((_s->>'win_by_two')::boolean, true),
    -- eliminatória nunca tem empate (#5)
    case when _no_draw then false else coalesce((_s->>'set_draw_enabled')::boolean, false) end,
    nullif(_s->>'time_minutes', '')::int
  )
  returning id;
$$;

-- Participante + membros. created_at = clock_timestamp(): numa transação o
-- now() é o mesmo para todos, e os geradores de jogos desempatam por ele.
create or replace function public.insert_participant(
  _cid uuid, _kind text, _source text, _status text, _seed int,
  _group_id uuid, _team_id uuid, _user_ids uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _pid uuid;
  _u uuid;
begin
  insert into public.participants (
    championship_id, kind, enrollment_source, enrollment_status, seed,
    group_id, championship_team_id, created_at
  ) values (
    _cid, _kind::participant_kind, _source, _status, _seed,
    _group_id, _team_id, clock_timestamp()
  )
  returning id into _pid;

  foreach _u in array _user_ids loop
    insert into public.participant_members (participant_id, user_id) values (_pid, _u);
  end loop;
  return _pid;
end; $$;

-- Grupos vazios de uma fase: "A", "B", … (ordering 1, 2, …).
create or replace function public.insert_stage_groups(_stage_id uuid, _num_groups int)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  _ids uuid[] := array[]::uuid[];
  _gid uuid;
  _g int;
begin
  for _g in 1..coalesce(_num_groups, 0) loop
    insert into public.groups (stage_id, name, ordering)
    values (_stage_id, case when _g <= 26 then chr(64 + _g) else _g::text end, _g)
    returning id into _gid;
    _ids := array_append(_ids, _gid);
  end loop;
  return _ids;
end; $$;

-- ── create_championship ──────────────────────────────────────────────────────
--
-- _c: { id?, name, format: liga|eliminatoria|grupos_elim, unit: player|pair,
--       status: rascunho|ativo, is_official?, start_date?, end_date?,
--       description?, venue_id?, allow_draw, points_win, points_draw,
--       points_loss, tiebreakers[], has_third_place,
--       stage {counting, rounds, sets_to_play, points_per_set, win_by_two,
--              set_draw_enabled, time_minutes}          (liga, eliminatória)
--       groups_stage {…}, elim_stage {…}, num_groups    (grupos+elim)
--       participants [{ user_ids[], seed?, group_index? (0-based) }] }
--
-- Grupos+elim: participante com group_index vai para esse grupo; sem ele, a
-- distribuição é em zigue-zague na ordem enviada (como a RPC antiga). Oficial:
-- grupos vazios, jogadores sem grupo e o campeonato fica em rascunho — a
-- alocação acontece no início (start_official_championship).

create or replace function public.create_championship(_c jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid        uuid := (select auth.uid());
  _id         uuid := nullif(_c->>'id', '')::uuid;
  _owner      uuid;
  _format     text := _c->>'format';
  _unit       text := coalesce(nullif(_c->>'unit', ''), 'player');
  _status     text := coalesce(nullif(_c->>'status', ''), 'rascunho');
  _official   boolean := coalesce((_c->>'is_official')::boolean, false);
  _allow_draw boolean;
  _grupos_id  uuid;
  _num_groups int;
  _group_ids  uuid[] := array[]::uuid[];
  _x          jsonb;
  _users      uuid[];
  _gid        uuid;
  _cur        int := 1;
  _dir        int := 1;
  _n          int := 0;
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;

  -- Idempotente: o mesmo envio repetido devolve o campeonato já criado.
  if _id is not null then
    select created_by into _owner from public.championships where id = _id;
    if found then
      if _owner = _uid then return _id; end if;
      raise exception 'id de campeonato ja usado';
    end if;
  else
    _id := gen_random_uuid();
  end if;

  if coalesce(trim(_c->>'name'), '') = '' then
    raise exception 'Informe o nome do campeonato.';
  end if;
  if _format is null or _format not in ('liga', 'eliminatoria', 'grupos_elim') then
    raise exception 'formato invalido: %', _format;
  end if;
  if _unit not in ('player', 'pair') then
    raise exception 'unidade invalida: %', _unit;
  end if;
  if _status not in ('rascunho', 'ativo') then
    raise exception 'status invalido: %', _status;
  end if;
  if _official and not public.is_organizer_or_admin(_uid) then
    raise exception 'Apenas organizadores podem criar campeonatos oficiais.';
  end if;

  -- Oficial de grupos+elim: jogadores individuais, inscrição até o início.
  if _official and _format = 'grupos_elim' then
    _unit := 'player';
    _status := 'rascunho';
  end if;

  -- Eliminatória nunca tem empate nem pontuação de empate (#5).
  _allow_draw := _format <> 'eliminatoria' and coalesce((_c->>'allow_draw')::boolean, false);

  -- 1. Campeonato em rascunho (participantes só entram em rascunho).
  insert into public.championships (
    id, name, format, unit, status, start_date, end_date, is_official,
    description, venue_id, allow_draw, has_third_place,
    points_win, points_draw, points_loss, tiebreakers, created_by
  ) values (
    _id,
    trim(_c->>'name'),
    _format::championship_format,
    _unit::confront_unit,
    'rascunho',
    nullif(_c->>'start_date', '')::date,
    nullif(_c->>'end_date', '')::date,
    _official,
    nullif(_c->>'description', ''),
    nullif(_c->>'venue_id', '')::uuid,
    _allow_draw,
    _format <> 'liga' and coalesce((_c->>'has_third_place')::boolean, false),
    coalesce((_c->>'points_win')::int, 3),
    case when _allow_draw then coalesce((_c->>'points_draw')::int, 1) else 0 end,
    coalesce((_c->>'points_loss')::int, 0),
    coalesce(
      (select array_agg(t) from jsonb_array_elements_text(_c->'tiebreakers') t),
      array['sets_ganhos', 'pontos_ganhos', 'pontos_sofridos_asc']
    ),
    _uid
  );

  -- 2. Fases (e grupos).
  if _format = 'liga' then
    perform public.insert_championship_stage(_id, 'Liga', 1, 'liga', coalesce(_c->'stage', '{}'), false);
  elsif _format = 'eliminatoria' then
    perform public.insert_championship_stage(_id, 'Eliminatória', 1, 'eliminatoria', coalesce(_c->'stage', '{}'), true);
  else
    _num_groups := coalesce((_c->>'num_groups')::int, 0);
    if _num_groups < 1 then raise exception 'numero de grupos invalido'; end if;
    _grupos_id := public.insert_championship_stage(_id, 'Grupos', 1, 'grupos', coalesce(_c->'groups_stage', '{}'), false);
    perform public.insert_championship_stage(_id, 'Eliminatórias', 2, 'eliminatoria', coalesce(_c->'elim_stage', '{}'), true);
    _group_ids := public.insert_stage_groups(_grupos_id, _num_groups);
  end if;

  -- 3. Participantes, na ordem enviada.
  for _x in select value from jsonb_array_elements(coalesce(_c->'participants', '[]')) loop
    select array_agg(u::uuid) into _users from jsonb_array_elements_text(_x->'user_ids') u;
    if coalesce(array_length(_users, 1), 0) <> (case when _unit = 'pair' then 2 else 1 end) then
      raise exception 'participante com numero de jogadores invalido';
    end if;

    _gid := null;
    if _format = 'grupos_elim' and not _official then
      if nullif(_x->>'group_index', '') is not null then
        _gid := coalesce(_group_ids[(_x->>'group_index')::int + 1], _group_ids[1]);
      else
        _gid := _group_ids[_cur];
        _cur := _cur + _dir;
        if _cur > _num_groups then
          _dir := -1; _cur := _num_groups;
        elsif _cur < 1 then
          _dir := 1; _cur := 1;
        end if;
      end if;
    end if;

    perform public.insert_participant(
      _id, _unit, 'organizador', 'confirmado', nullif(_x->>'seed', '')::int, _gid, null, _users
    );
    _n := _n + 1;
  end loop;

  if _format = 'grupos_elim' and not _official and _n < 2 then
    raise exception 'minimo 2 jogadores';
  end if;

  -- 4. Ativa → o gatilho championship_status gera os jogos.
  if _status = 'ativo' then
    update public.championships set status = 'ativo' where id = _id;
  end if;

  return _id;
end; $$;

-- ── create_challenge ─────────────────────────────────────────────────────────
--
-- _c: { id?, type: 1v1|duplas|times, name, venue_id?, points_win, points_draw,
--       points_loss, tiebreakers[],
--       stage {counting, rounds, sets_to_play, points_per_set, win_by_two,
--              set_draw_enabled, time_minutes},
--       opponent_id                          (1v1)
--       partner_id, opponent_ids [2]         (duplas)
--       has_final, team_a, team_b            (times: {team_id, name, player_ids[]}) }
--
-- 1v1 fica em rascunho com o oponente pendente: o aceite (respond_challenge_invite)
-- ativa. Duplas e times entram confirmados e ativam na hora.

create or replace function public.create_challenge(_c jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid      uuid := (select auth.uid());
  _id       uuid := nullif(_c->>'id', '')::uuid;
  _owner    uuid;
  _type     text := _c->>'type';
  _stage    jsonb := coalesce(_c->'stage', '{}');
  _allow    boolean;
  _opponent uuid;
  _partner  uuid;
  _opps     uuid[];
  _team_a   jsonb := _c->'team_a';
  _team_b   jsonb := _c->'team_b';
  _a_ids    uuid[];
  _b_ids    uuid[];
  _side     jsonb;
  _ids      uuid[];
  _ct       uuid;
  _u        uuid;
  _ord      int := 0;
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;

  if _id is not null then
    select created_by into _owner from public.championships where id = _id;
    if found then
      if _owner = _uid then return _id; end if;
      raise exception 'id de campeonato ja usado';
    end if;
  else
    _id := gen_random_uuid();
  end if;

  if _type is null or _type not in ('1v1', 'duplas', 'times') then
    raise exception 'tipo de desafio invalido: %', _type;
  end if;
  if coalesce(trim(_c->>'name'), '') = '' then
    raise exception 'Informe o nome do desafio.';
  end if;

  -- Validações (as mesmas das server actions).
  if _type = '1v1' then
    _opponent := nullif(_c->>'opponent_id', '')::uuid;
    if _opponent is null then raise exception 'Selecione um oponente.'; end if;
    if _opponent = _uid then raise exception 'Você não pode desafiar a si mesmo.'; end if;
  elsif _type = 'duplas' then
    _partner := nullif(_c->>'partner_id', '')::uuid;
    select array_agg(u::uuid) into _opps from jsonb_array_elements_text(_c->'opponent_ids') u;
    if _partner is null or coalesce(array_length(_opps, 1), 0) <> 2
       or (select count(distinct x) from unnest(array[_uid, _partner] || _opps) x) <> 4 then
      raise exception 'Selecione 4 jogadores distintos (você, seu parceiro e a dupla adversária).';
    end if;
  else
    select array_agg(u::uuid) into _a_ids from jsonb_array_elements_text(_team_a->'player_ids') u;
    select array_agg(u::uuid) into _b_ids from jsonb_array_elements_text(_team_b->'player_ids') u;
    if (_team_a->>'team_id') = (_team_b->>'team_id') then
      raise exception 'Escolha dois times diferentes.';
    end if;
    if coalesce(array_length(_a_ids, 1), 0) < 1 or coalesce(array_length(_b_ids, 1), 0) < 1 then
      raise exception 'Selecione os jogadores dos dois times.';
    end if;
    if array_length(_a_ids, 1) <> array_length(_b_ids, 1) then
      raise exception 'Os dois times precisam ter a mesma quantidade de jogadores.';
    end if;
    if (select count(distinct x) from unnest(_a_ids || _b_ids) x) <> array_length(_a_ids || _b_ids, 1) then
      raise exception 'Um jogador não pode estar nos dois times.';
    end if;
  end if;

  _allow := coalesce(nullif(_stage->>'counting', ''), 'set') = 'tempo'
            or coalesce((_stage->>'set_draw_enabled')::boolean, false);

  -- 1. Desafio em rascunho.
  insert into public.championships (
    id, name, format, unit, status, allow_draw, has_final,
    points_win, points_draw, points_loss, tiebreakers, created_by, venue_id
  ) values (
    _id,
    trim(_c->>'name'),
    'desafio',
    (case _type when '1v1' then 'player' when 'duplas' then 'pair' else 'team' end)::confront_unit,
    'rascunho',
    _allow,
    _type = 'times' and coalesce((_c->>'has_final')::boolean, false),
    coalesce((_c->>'points_win')::int, 3),
    case when _allow then coalesce((_c->>'points_draw')::int, 1) else 0 end,
    coalesce((_c->>'points_loss')::int, 0),
    coalesce(
      (select array_agg(t) from jsonb_array_elements_text(_c->'tiebreakers') t),
      array['sets_ganhos', 'pontos_ganhos', 'pontos_sofridos_asc']
    ),
    _uid,
    nullif(_c->>'venue_id', '')::uuid
  );

  -- 2. Fase única.
  perform public.insert_championship_stage(_id, 'Fase única', 1, 'liga', _stage, false);

  -- 3. Lados.
  if _type = '1v1' then
    perform public.insert_participant(_id, 'player', 'organizador', 'confirmado', null, null, null, array[_uid]);
    perform public.insert_participant(_id, 'player', 'jogador', 'pendente', null, null, null, array[_opponent]);
    return _id; -- ativa no aceite do convite
  elsif _type = 'duplas' then
    perform public.insert_participant(_id, 'pair', 'organizador', 'confirmado', null, null, null, array[_uid, _partner]);
    perform public.insert_participant(_id, 'pair', 'organizador', 'confirmado', null, null, null, _opps);
  else
    foreach _side in array array[_team_a, _team_b] loop
      insert into public.championship_teams (championship_id, name, team_id, ordering)
      values (_id, _side->>'name', nullif(_side->>'team_id', '')::uuid, _ord)
      returning id into _ct;
      select array_agg(u::uuid) into _ids from jsonb_array_elements_text(_side->'player_ids') u;
      foreach _u in array _ids loop
        perform public.insert_participant(_id, 'player', 'organizador', 'confirmado', null, null, _ct, array[_u]);
      end loop;
      _ord := _ord + 1;
    end loop;
  end if;

  -- 4. Ativa → o gatilho gera os jogos (round-robin ou cruzados entre times).
  update public.championships set status = 'ativo' where id = _id;
  return _id;
end; $$;

-- ── Gestão do campeonato oficial ─────────────────────────────────────────────

-- Organizador inscreve um jogador direto (confirmado).
create or replace function public.add_participant(_championship_id uuid, _user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;
  if not exists (select 1 from public.championships where id = _championship_id) then
    raise exception 'Campeonato não encontrado.';
  end if;
  if not public.can_manage_championship(_championship_id) then
    raise exception 'Sem permissão para gerenciar este campeonato.';
  end if;
  if exists (
    select 1 from public.participants p
      join public.participant_members pm on pm.participant_id = p.id
     where p.championship_id = _championship_id and pm.user_id = _user_id
  ) then
    raise exception 'Jogador já inscrito neste campeonato.';
  end if;

  -- Fora do rascunho o gatilho participants_guard recusa ("lista travada").
  return public.insert_participant(
    _championship_id, 'player', 'organizador', 'confirmado', null, null, null, array[_user_id]
  );
end; $$;

-- Inicia o oficial: descarta pendentes, distribui os confirmados nos grupos
-- (grupos+elim, zigue-zague por seed) e ativa — o gatilho gera os jogos.
create or replace function public.start_official_championship(_championship_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid    uuid := (select auth.uid());
  _champ  record;
  _stage  uuid;
  _groups uuid[];
  _n      int;
  _i      int := 0;
  _p      record;
  _round  int;
  _pos    int;
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;

  select id, format, status into _champ
    from public.championships where id = _championship_id
    for update;
  if not found then raise exception 'Campeonato não encontrado.'; end if;
  if not public.can_manage_championship(_championship_id) then
    raise exception 'Sem permissão para gerenciar este campeonato.';
  end if;
  if _champ.status <> 'rascunho' then raise exception 'O campeonato já foi iniciado.'; end if;

  if (select count(*) from public.participants
       where championship_id = _championship_id and enrollment_status = 'confirmado') < 2 then
    raise exception 'É preciso ao menos 2 jogadores confirmados.';
  end if;

  -- Pendentes não aprovados não entram no chaveamento.
  delete from public.participants
   where championship_id = _championship_id and enrollment_status = 'pendente';

  if _champ.format = 'grupos_elim' then
    select id into _stage from public.championship_stages
     where championship_id = _championship_id and kind = 'grupos'
     order by ordering limit 1;
    if _stage is null then raise exception 'Fase de grupos não encontrada.'; end if;

    select array_agg(id order by ordering) into _groups from public.groups where stage_id = _stage;
    _n := coalesce(array_length(_groups, 1), 0);
    if _n = 0 then raise exception 'Nenhum grupo configurado.'; end if;

    -- Zigue-zague: ordena por seed (sem seed por último).
    for _p in
      select id from public.participants
       where championship_id = _championship_id and enrollment_status = 'confirmado'
       order by coalesce(seed, 9999), created_at, id
    loop
      _round := _i / _n;
      _pos := _i % _n;
      update public.participants
         set group_id = _groups[case when _round % 2 = 0 then _pos else _n - 1 - _pos end + 1]
       where id = _p.id;
      _i := _i + 1;
    end loop;
  end if;

  update public.championships set status = 'ativo' where id = _championship_id;
  return _championship_id;
end; $$;

-- Edição do oficial até o início.
-- _p: { name, description, venue_id, start_date, end_date, points_win,
--       points_draw, points_loss, allow_draw, has_third_place,
--       stages [{id, counting, rounds, sets_to_play, points_per_set,
--                win_by_two, set_draw_enabled, time_minutes}],
--       num_groups? (grupos+elim: recria os grupos vazios se mudar) }
create or replace function public.update_official_championship(_id uuid, _p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid   uuid := (select auth.uid());
  _champ record;
  _allow boolean := coalesce((_p->>'allow_draw')::boolean, false);
  _s     jsonb;
  _stage uuid;
  _num   int := nullif(_p->>'num_groups', '')::int;
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;

  select id, status, is_official, format into _champ
    from public.championships where id = _id
    for update;
  if not found then raise exception 'Campeonato não encontrado.'; end if;
  if not public.can_manage_championship(_id) then
    raise exception 'Sem permissão para gerenciar este campeonato.';
  end if;
  if not _champ.is_official then
    raise exception 'Apenas campeonatos oficiais podem ser editados aqui.';
  end if;
  if _champ.status <> 'rascunho' then
    raise exception 'Só é possível editar antes do início.';
  end if;

  -- 1. Campeonato.
  update public.championships set
    name            = trim(_p->>'name'),
    description     = nullif(_p->>'description', ''),
    venue_id        = nullif(_p->>'venue_id', '')::uuid,
    start_date      = nullif(_p->>'start_date', '')::date,
    end_date        = nullif(_p->>'end_date', '')::date,
    points_win      = coalesce((_p->>'points_win')::int, points_win),
    points_draw     = case when _allow then coalesce((_p->>'points_draw')::int, points_draw) else 0 end,
    points_loss     = coalesce((_p->>'points_loss')::int, points_loss),
    allow_draw      = _allow,
    has_third_place = coalesce((_p->>'has_third_place')::boolean, has_third_place)
  where id = _id;

  -- 2. Fases (só as deste campeonato).
  for _s in select value from jsonb_array_elements(coalesce(_p->'stages', '[]')) loop
    update public.championship_stages set
      counting         = coalesce(nullif(_s->>'counting', ''), counting::text)::counting_system,
      rounds           = coalesce((_s->>'rounds')::int, rounds),
      sets_to_play     = coalesce((_s->>'sets_to_play')::int, sets_to_play),
      points_per_set   = coalesce((_s->>'points_per_set')::int, points_per_set),
      win_by_two       = coalesce((_s->>'win_by_two')::boolean, win_by_two),
      set_draw_enabled = coalesce((_s->>'set_draw_enabled')::boolean, set_draw_enabled),
      time_minutes     = nullif(_s->>'time_minutes', '')::int
    where id = (_s->>'id')::uuid and championship_id = _id;
  end loop;

  -- 3. Grupos+elim: recria os grupos vazios se o número mudou.
  if _champ.format = 'grupos_elim' and coalesce(_num, 0) > 0 then
    select id into _stage from public.championship_stages
     where championship_id = _id and kind = 'grupos'
     order by ordering limit 1;
    if _stage is not null
       and (select count(*) from public.groups where stage_id = _stage) <> _num then
      update public.participants set group_id = null where championship_id = _id;
      delete from public.groups where stage_id = _stage;
      perform public.insert_stage_groups(_stage, _num);
    end if;
  end if;

  return _id;
end; $$;

-- ── Travas de edição ─────────────────────────────────────────────────────────

create or replace function public.trg_championships_lock()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
begin
  -- Oficial: só organizador/admin. Sem usuário (manutenção pelo próprio banco)
  -- passa; sem login, o RLS já impede qualquer UPDATE.
  if new.is_official is distinct from old.is_official
     and _uid is not null and not public.is_organizer_or_admin(_uid) then
    raise exception 'Apenas organizadores podem alterar se o campeonato é oficial.';
  end if;

  -- Fora do rascunho, nada que mude a geração de jogos ou a classificação.
  -- O status em si continua livre (ativar, encerrar, reabrir).
  if old.status <> 'rascunho' and (
       new.format          is distinct from old.format
    or new.unit            is distinct from old.unit
    or new.points_win      is distinct from old.points_win
    or new.points_draw     is distinct from old.points_draw
    or new.points_loss     is distinct from old.points_loss
    or new.allow_draw      is distinct from old.allow_draw
    or new.tiebreakers     is distinct from old.tiebreakers
    or new.has_third_place is distinct from old.has_third_place
    or new.has_final       is distinct from old.has_final
  ) then
    raise exception 'Formato e pontuação só podem ser alterados com o campeonato em rascunho.';
  end if;

  return new;
end; $$;

drop trigger if exists championships_lock on public.championships;
create trigger championships_lock
  before update on public.championships
  for each row execute function public.trg_championships_lock();

create or replace function public.trg_championship_stages_lock()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _status text;
begin
  select status into _status from public.championships where id = old.championship_id;
  if _status is distinct from 'rascunho' and (
       new.championship_id  is distinct from old.championship_id
    or new.kind             is distinct from old.kind
    or new.ordering         is distinct from old.ordering
    or new.counting         is distinct from old.counting
    or new.rounds           is distinct from old.rounds
    or new.sets_to_play     is distinct from old.sets_to_play
    or new.points_per_set   is distinct from old.points_per_set
    or new.win_by_two       is distinct from old.win_by_two
    or new.set_draw_enabled is distinct from old.set_draw_enabled
    or new.time_minutes     is distinct from old.time_minutes
  ) then
    raise exception 'As regras da fase só podem ser alteradas com o campeonato em rascunho.';
  end if;
  return new;
end; $$;

drop trigger if exists championship_stages_lock on public.championship_stages;
create trigger championship_stages_lock
  before update on public.championship_stages
  for each row execute function public.trg_championship_stages_lock();

-- ── Permissões ───────────────────────────────────────────────────────────────

-- Do app: só autenticados (cada uma confere permissão por dentro).
revoke all on function public.create_championship(jsonb) from public, anon;
revoke all on function public.create_challenge(jsonb) from public, anon;
revoke all on function public.add_participant(uuid, uuid) from public, anon;
revoke all on function public.start_official_championship(uuid) from public, anon;
revoke all on function public.update_official_championship(uuid, jsonb) from public, anon;
grant execute on function public.create_championship(jsonb) to authenticated;
grant execute on function public.create_challenge(jsonb) to authenticated;
grant execute on function public.add_participant(uuid, uuid) to authenticated;
grant execute on function public.start_official_championship(uuid) to authenticated;
grant execute on function public.update_official_championship(uuid, jsonb) to authenticated;

-- Internas e de gatilho: ninguém de fora.
revoke all on function public.insert_championship_stage(uuid, text, int, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.insert_participant(uuid, text, text, text, int, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.insert_stage_groups(uuid, int) from public, anon, authenticated;
revoke all on function public.trg_championships_lock() from public, anon, authenticated;
revoke all on function public.trg_championship_stages_lock() from public, anon, authenticated;
