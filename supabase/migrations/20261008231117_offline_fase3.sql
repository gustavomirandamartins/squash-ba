-- Fase 3 do motor offline.
--
-- import_championship passa a aceitar DESAFIOS criados offline:
--   • desafio de duplas (unit = 'pair'): 2 duplas, `rounds` jogos;
--   • desafio por times (unit = 'team'): 2 times (championship_teams), cada
--     jogador é um participante do seu time; a final (bracket_slot = -1,
--     round 999), se o aparelho já a gerou, vem junto com os demais jogos.
-- O desafio 1v1 continua online (depende do aceite do convite).
--
-- Mesmo contrato da Fase 2: idempotente pelo ID do aparelho, tudo numa
-- transação, os triggers de sempre recalculam resultados e encerramento.

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

  if (_c->>'format') not in ('liga', 'eliminatoria', 'grupos_elim', 'desafio') then
    raise exception 'formato invalido para importacao: %', _c->>'format';
  end if;
  -- Desafio 1v1 depende do aceite do convite: não é importado pronto.
  if (_c->>'format') = 'desafio' then
    if (_c->>'unit') not in ('pair', 'team') then
      raise exception 'unidade invalida para desafio importado: %', _c->>'unit';
    end if;
  elsif (_c->>'unit') not in ('player', 'pair') then
    raise exception 'unidade invalida para importacao: %', _c->>'unit';
  end if;

  -- 1. Campeonato em rascunho (participantes só entram em rascunho).
  insert into public.championships (
    id, name, format, unit, status, start_date, end_date, is_official,
    description, venue_id, allow_draw, has_third_place, has_final,
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
    coalesce((_c->>'has_final')::boolean, false),
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

  -- Desafio por times: os dois lados.
  for _x in select value from jsonb_array_elements(coalesce(_c->'teams', '[]'::jsonb)) loop
    insert into public.championship_teams (id, championship_id, name, team_id, ordering)
    values ((_x->>'id')::uuid, _id, _x->>'name', nullif(_x->>'team_id', '')::uuid,
            coalesce((_x->>'ordering')::int, 0));
  end loop;
  if (_c->>'unit') = 'team'
     and (select count(*) from public.championship_teams where championship_id = _id) <> 2 then
    raise exception 'desafio por times precisa de exatamente 2 times';
  end if;

  -- 3. Participantes, na ordem do aparelho (created_at crescente, como no
  --    cadastro normal — os geradores do servidor desempatam por ele).
  for _x in select value from jsonb_array_elements(_c->'participants') loop
    if nullif(_x->>'group_id', '') is not null and not exists (
      select 1 from public.groups g join public.championship_stages s on s.id = g.stage_id
       where g.id = (_x->>'group_id')::uuid and s.championship_id = _id
    ) then
      raise exception 'participante aponta para grupo de outro campeonato';
    end if;
    if nullif(_x->>'team_id', '') is not null and not exists (
      select 1 from public.championship_teams t
       where t.id = (_x->>'team_id')::uuid and t.championship_id = _id
    ) then
      raise exception 'participante aponta para time de outro campeonato';
    end if;
    insert into public.participants (
      id, championship_id, kind, enrollment_source, enrollment_status, seed, group_id,
      championship_team_id, created_at
    ) values (
      (_x->>'id')::uuid, _id, (_x->>'kind')::participant_kind, 'organizador', 'confirmado',
      nullif(_x->>'seed', '')::int, nullif(_x->>'group_id', '')::uuid,
      nullif(_x->>'team_id', '')::uuid, clock_timestamp()
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
