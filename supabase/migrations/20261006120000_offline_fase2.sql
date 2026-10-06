-- ============================================================================
-- Motor offline — Fase 2
--
-- 1. apply_match_ops: aplica, numa única chamada e numa única transação, as
--    ações de placar que o aparelho acumulou (placar, encerramento, W.O.,
--    cronômetro, reabrir, limpar, data). Detecta conflito comparando games
--    (servidor × última versão que o aparelho viu × placar local) — sem
--    relógio. Cada ação roda isolada: a que falha volta em `rejected` e as
--    outras seguem.
--
-- 2. import_championship: cria um campeonato feito OFFLINE exatamente como o
--    aparelho o montou — mesmos IDs, mesmos jogos, mesma chave — e já com os
--    placares. Idempotente: reenviar o mesmo ID devolve o mesmo campeonato
--    (resposta perdida no meio do caminho nunca duplica).
--
-- Seguro aplicar mais de uma vez (create or replace).
-- ============================================================================


-- ── 1. apply_match_ops ──────────────────────────────────────────────────────
create or replace function public.apply_match_ops(
  _match_id  uuid,
  _ops       jsonb,
  _base      jsonb default null,  -- games do servidor que o aparelho viu por último
  _local     jsonb default null,  -- games finais que a fila deixa
  _device_id text  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _uid        uuid := (select auth.uid());
  m           record;
  _can_manage boolean;
  _op         jsonb;
  _kind       text;
  _games      jsonb;
  _rejected   jsonb := '[]'::jsonb;
  _applied    int := 0;
begin
  if _uid is null then raise exception 'nao autenticado'; end if;

  -- Trava a partida: dois aparelhos enviando ao mesmo tempo entram em fila.
  select * into m from public.matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  _can_manage := public.can_manage_championship(m.championship_id);
  if not _can_manage and not exists (
    select 1 from public.participant_members pm
     where pm.user_id = _uid
       and pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
  ) then
    raise exception 'sem permissao para lancar o placar desta partida';
  end if;

  -- Em revisão: aplicar agora reabriria a partida (resolve_match recalcula).
  if m.status::text = 'revisao' then
    return jsonb_build_object('status', 'conflict');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'game_number', g.game_number, 'score_a', g.score_a, 'score_b', g.score_b)
           order by g.game_number), '[]'::jsonb)
    into _games
    from public.match_games g where g.match_id = _match_id;

  -- Conflito real: outro aparelho mudou um game que esta fila também muda,
  -- para um valor diferente. Só o organizador abre revisão; para participante
  -- o placar enviado prevalece (não trava quem está marcando).
  if _can_manage and _base is not null and _local is not null and exists (
    select 1
      from jsonb_to_recordset(_local) l(game_number int, score_a int, score_b int)
      left join jsonb_to_recordset(_games) s(game_number int, score_a int, score_b int)
             on s.game_number = l.game_number
      left join jsonb_to_recordset(_base) b(game_number int, score_a int, score_b int)
             on b.game_number = l.game_number
     where (coalesce(s.score_a, 0), coalesce(s.score_b, 0))
             is distinct from (coalesce(b.score_a, 0), coalesce(b.score_b, 0))
       and (coalesce(s.score_a, 0), coalesce(s.score_b, 0))
             is distinct from (l.score_a, l.score_b)
  ) then
    update public.matches
       set status = 'revisao', conflict_server_snapshot = jsonb_build_object('games', _games)
     where id = _match_id;
    return jsonb_build_object('status', 'conflict', 'games', _games);
  end if;

  for _op in select value from jsonb_array_elements(coalesce(_ops, '[]'::jsonb)) loop
    begin
      _kind := _op->>'type';

      if _kind = 'upsert_games' then
        insert into public.match_games (match_id, game_number, score_a, score_b, last_device_id)
        select _match_id, g.game_number, g.score_a, g.score_b, _device_id
          from jsonb_to_recordset(_op->'games') g(game_number int, score_a int, score_b int)
        on conflict (match_id, game_number) do update
          set score_a = excluded.score_a,
              score_b = excluded.score_b,
              last_device_id = excluded.last_device_id;

      elsif _kind = 'delete_game' then
        delete from public.match_games
         where match_id = _match_id and game_number = (_op->>'game_number')::int;

      elsif _kind = 'finish_timer' then
        -- Duração antes do placar: resolve_match só finaliza jogo por tempo
        -- com duration_seconds preenchido.
        update public.matches set duration_seconds = (_op->>'seconds')::int where id = _match_id;
        insert into public.match_games (match_id, game_number, score_a, score_b, last_device_id)
        values (_match_id, 1, (_op->>'score_a')::int, (_op->>'score_b')::int, _device_id)
        on conflict (match_id, game_number) do update
          set score_a = excluded.score_a,
              score_b = excluded.score_b,
              last_device_id = excluded.last_device_id;

      elsif _kind = 'finalize' then
        -- Reusa as RPCs de encerramento (regras e permissões continuam lá).
        if _op->>'kind' = 'double_wo' then
          if _can_manage then perform public.finalize_match_double_wo(_match_id);
          else perform public.finalize_match_double_wo_by_participant(_match_id); end if;
        elsif _op->>'kind' = 'wo' then
          if _can_manage then perform public.finalize_match_wo(_match_id, _op->>'result');
          else perform public.finalize_match_wo_by_participant(_match_id, _op->>'result'); end if;
        elsif _op->>'kind' = 'dq' then
          if _can_manage then perform public.finalize_match_dq(_match_id, _op->>'result');
          else perform public.finalize_match_dq_by_participant(_match_id, _op->>'result'); end if;
        else
          if _can_manage then perform public.finalize_match_manual(_match_id, _op->>'result');
          else perform public.finalize_match_by_participant(_match_id, _op->>'result'); end if;
        end if;

      elsif _kind = 'reopen' then
        if _can_manage then
          -- is_wo=false também zera is_double_wo (trigger)
          update public.matches
             set status = 'em_andamento', result = null, is_wo = false
           where id = _match_id and status = 'finalizado';
        else
          perform public.reopen_match_by_participant(_match_id);
        end if;

      elsif _kind = 'clear' then
        perform public.reset_match_data(_match_id);

      elsif _kind = 'schedule' then
        update public.matches
           set scheduled_at = nullif(_op->>'at', '')::timestamptz
         where id = _match_id;

      else
        raise exception 'operacao desconhecida: %', _kind;
      end if;

      _applied := _applied + 1;
    exception when others then
      -- Só esta ação é desfeita; as demais seguem.
      _rejected := _rejected || jsonb_build_array(
        jsonb_build_object('ids', _op->'ids', 'error', sqlerrm));
    end;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'game_number', g.game_number, 'score_a', g.score_a, 'score_b', g.score_b)
           order by g.game_number), '[]'::jsonb)
    into _games
    from public.match_games g where g.match_id = _match_id;

  return jsonb_build_object(
    'status',   'ok',
    'applied',  _applied,
    'rejected', _rejected,
    'games',    _games
  );
end; $$;

revoke all on function public.apply_match_ops(uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.apply_match_ops(uuid, jsonb, jsonb, jsonb, text) to authenticated;


-- ── 2. import_championship ──────────────────────────────────────────────────
-- Payload (montado em src/lib/offline/import-payload.ts):
-- { id, name, format, unit, start_date, end_date, description, venue_id,
--   allow_draw, has_third_place, points_win, points_draw, points_loss, tiebreakers[],
--   stages:       [{ id, name, ordering, kind, counting, rounds, sets_to_play,
--                    points_per_set, win_by_two, set_draw_enabled, time_minutes }],
--   groups:       [{ id, stage_id, name, ordering }],
--   participants: [{ id, kind, seed, group_id, user_ids[] }],
--   matches:      [{ id, stage_id, group_id, round, bracket_slot, side_a, side_b,
--                    status, result, winner_advances_to, duration_seconds,
--                    games: [{ game_number, score_a, score_b }] }] }
create or replace function public.import_championship(_c jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid   uuid := (select auth.uid());
  _id    uuid := nullif(_c->>'id', '')::uuid;
  _owner uuid;
  _x     jsonb;
  _u     text;
begin
  if _uid is null then raise exception 'nao autenticado'; end if;
  if _id is null then raise exception 'id do campeonato obrigatorio'; end if;

  -- Idempotente: o mesmo envio repetido devolve o campeonato já criado.
  select created_by into _owner from public.championships where id = _id;
  if found then
    if _owner = _uid then return _id; end if;
    raise exception 'id de campeonato ja usado';
  end if;

  if (_c->>'format') not in ('liga', 'eliminatoria', 'grupos_elim') then
    raise exception 'formato invalido para importacao: %', _c->>'format';
  end if;
  if (_c->>'unit') not in ('player', 'pair') then
    raise exception 'unidade invalida para importacao: %', _c->>'unit';
  end if;

  -- 1. Campeonato em rascunho (participantes só entram em rascunho).
  insert into public.championships (
    id, name, format, unit, status, start_date, end_date, is_official,
    description, venue_id, allow_draw, has_third_place,
    points_win, points_draw, points_loss, tiebreakers, created_by
  ) values (
    _id,
    trim(_c->>'name'),
    (_c->>'format')::championship_format,
    (_c->>'unit')::confront_unit,
    'rascunho',
    nullif(_c->>'start_date', '')::date,
    nullif(_c->>'end_date', '')::date,
    false,
    nullif(_c->>'description', ''),
    nullif(_c->>'venue_id', '')::uuid,
    coalesce((_c->>'allow_draw')::boolean, false),
    coalesce((_c->>'has_third_place')::boolean, false),
    coalesce((_c->>'points_win')::int, 3),
    coalesce((_c->>'points_draw')::int, 0),
    coalesce((_c->>'points_loss')::int, 0),
    coalesce(array(select jsonb_array_elements_text(_c->'tiebreakers')),
             array['sets_ganhos', 'pontos_ganhos', 'pontos_sofridos_asc']),
    _uid
  );

  -- 2. Fases e grupos.
  for _x in select value from jsonb_array_elements(_c->'stages') loop
    insert into public.championship_stages (
      id, championship_id, name, ordering, kind, counting, rounds, sets_to_play,
      points_per_set, win_by_two, set_draw_enabled, time_minutes
    ) values (
      (_x->>'id')::uuid, _id, _x->>'name', (_x->>'ordering')::int, _x->>'kind',
      (_x->>'counting')::counting_system, coalesce((_x->>'rounds')::int, 1),
      (_x->>'sets_to_play')::int, (_x->>'points_per_set')::int,
      coalesce((_x->>'win_by_two')::boolean, true),
      coalesce((_x->>'set_draw_enabled')::boolean, false),
      nullif(_x->>'time_minutes', '')::int
    );
  end loop;

  for _x in select value from jsonb_array_elements(coalesce(_c->'groups', '[]'::jsonb)) loop
    if not exists (select 1 from public.championship_stages
                    where id = (_x->>'stage_id')::uuid and championship_id = _id) then
      raise exception 'grupo aponta para fase de outro campeonato';
    end if;
    insert into public.groups (id, stage_id, name, ordering)
    values ((_x->>'id')::uuid, (_x->>'stage_id')::uuid, _x->>'name', (_x->>'ordering')::int);
  end loop;

  -- 3. Participantes, na ordem do aparelho (created_at crescente, como no
  --    cadastro normal — os geradores do servidor desempatam por ele).
  for _x in select value from jsonb_array_elements(_c->'participants') loop
    if nullif(_x->>'group_id', '') is not null and not exists (
      select 1 from public.groups g join public.championship_stages s on s.id = g.stage_id
       where g.id = (_x->>'group_id')::uuid and s.championship_id = _id
    ) then
      raise exception 'participante aponta para grupo de outro campeonato';
    end if;
    insert into public.participants (
      id, championship_id, kind, enrollment_source, enrollment_status, seed, group_id, created_at
    ) values (
      (_x->>'id')::uuid, _id, (_x->>'kind')::participant_kind, 'organizador', 'confirmado',
      nullif(_x->>'seed', '')::int, nullif(_x->>'group_id', '')::uuid, clock_timestamp()
    );
    for _u in select jsonb_array_elements_text(_x->'user_ids') loop
      insert into public.participant_members (participant_id, user_id)
      values ((_x->>'id')::uuid, _u::uuid);
    end loop;
  end loop;

  -- 4. Ativa (como na criação normal). O trigger gera os jogos do servidor;
  --    eles são trocados pelos do aparelho logo abaixo — o que o organizador
  --    jogou offline é o que vale.
  update public.championships set status = 'ativo' where id = _id;
  delete from public.matches where championship_id = _id;

  -- 5. Jogos com os IDs do aparelho. Ainda sem placar: os games entram no
  --    passo 7 e os triggers de sempre (resolve_match, avanço de chave,
  --    encerramento do campeonato) fazem o resto.
  for _x in select value from jsonb_array_elements(_c->'matches') loop
    insert into public.matches (
      id, championship_id, stage_id, group_id, round, bracket_slot,
      side_a_participant_id, side_b_participant_id, status, result, duration_seconds
    ) values (
      (_x->>'id')::uuid, _id,
      (_x->>'stage_id')::uuid,
      nullif(_x->>'group_id', '')::uuid,
      (_x->>'round')::int,
      nullif(_x->>'bracket_slot', '')::int,
      nullif(_x->>'side_a', '')::uuid,
      nullif(_x->>'side_b', '')::uuid,
      -- só o "bye" (passagem automática) nasce finalizado, sem placar
      case when _x->>'status' = 'finalizado' and jsonb_array_length(coalesce(_x->'games', '[]'::jsonb)) = 0
           then 'finalizado'::match_status else 'agendado'::match_status end,
      case when _x->>'status' = 'finalizado' and jsonb_array_length(coalesce(_x->'games', '[]'::jsonb)) = 0
           then nullif(_x->>'result', '')::match_result else null end,
      nullif(_x->>'duration_seconds', '')::int
    );
  end loop;

  -- Tudo que os jogos referenciam tem de ser deste campeonato.
  if exists (
    select 1 from public.matches mt
     where mt.championship_id = _id
       and (
         (mt.stage_id is not null and not exists (select 1 from public.championship_stages s where s.id = mt.stage_id and s.championship_id = _id))
         or (mt.side_a_participant_id is not null and not exists (select 1 from public.participants p where p.id = mt.side_a_participant_id and p.championship_id = _id))
         or (mt.side_b_participant_id is not null and not exists (select 1 from public.participants p where p.id = mt.side_b_participant_id and p.championship_id = _id))
       )
  ) then
    raise exception 'jogo aponta para fase ou participante de outro campeonato';
  end if;

  -- 6. Avanço da chave (depois de todos os jogos existirem).
  for _x in select value from jsonb_array_elements(_c->'matches') loop
    if nullif(_x->>'winner_advances_to', '') is not null then
      if not exists (select 1 from public.matches
                      where id = (_x->>'winner_advances_to')::uuid and championship_id = _id) then
        raise exception 'avanco de chave aponta para jogo de outro campeonato';
      end if;
      update public.matches set winner_advances_to = (_x->>'winner_advances_to')::uuid
       where id = (_x->>'id')::uuid;
    end if;
  end loop;

  -- 7. Placares, rodada a rodada.
  for _x in
    select value from jsonb_array_elements(_c->'matches')
     order by coalesce((value->>'round')::int, 0), coalesce((value->>'bracket_slot')::int, 0)
  loop
    insert into public.match_games (match_id, game_number, score_a, score_b)
    select (_x->>'id')::uuid, g.game_number, g.score_a, g.score_b
      from jsonb_to_recordset(coalesce(_x->'games', '[]'::jsonb))
           g(game_number int, score_a int, score_b int)
     order by g.game_number;
  end loop;

  return _id;
end; $$;

revoke all on function public.import_championship(jsonb) from public, anon;
grant execute on function public.import_championship(jsonb) to authenticated;
