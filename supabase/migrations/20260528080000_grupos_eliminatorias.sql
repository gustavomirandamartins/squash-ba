-- ===== Coluna group_id em participants =====
alter table public.participants
  add column if not exists group_id uuid references public.groups(id) on delete set null;
create index if not exists idx_participants_group_id on public.participants(group_id);

-- ===== Criação transacional de campeonato Grupos+Elim =====
create or replace function public.create_grupos_elim_championship(
  _name text,
  _num_groups int,
  _qualifiers_per_group int,
  _points_win int, _points_draw int, _points_loss int,
  _allow_draw boolean, _tiebreakers text[],
  -- stage grupos
  _groups_counting text, _groups_rounds int,
  _groups_sets_to_play int, _groups_points_per_set int,
  _groups_win_by_two boolean, _groups_set_draw_enabled boolean,
  _groups_time_minutes int,
  -- stage eliminatória
  _elim_counting text, _elim_sets_to_play int,
  _elim_points_per_set int, _elim_win_by_two boolean,
  _elim_set_draw_enabled boolean, _elim_time_minutes int,
  _has_third_place boolean,
  _player_ids uuid[],
  _seeds int[] -- paralelo a _player_ids; null = sem seed
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
  _cid uuid; _stage_grupos_id uuid; _stage_elim_id uuid;
  _group_ids uuid[]; _g int; _n int; _i int;
  _pid uuid; _player uuid;
  _total_qualifiers int; _has_repechage boolean;
  _stage_rep_id uuid;
  _group_names text[] := array['A','B','C','D','E','F','G','H'];
  _snake_pos int; _snake_dir int := 1; _cur_group int := 1;
begin
  if _uid is null then raise exception 'usuario nao autenticado'; end if;

  _n := coalesce(array_length(_player_ids,1), 0);
  if _n < 2 then raise exception 'minimo 2 jogadores'; end if;

  _total_qualifiers := _num_groups * _qualifiers_per_group;
  _has_repechage := (_total_qualifiers % 2 != 0);

  -- cria campeonato em rascunho
  insert into public.championships
    (name, format, unit, points_win, points_draw, points_loss,
     allow_draw, tiebreakers, has_third_place, status, created_by)
  values
    (_name, 'grupos_elim', 'player',
     coalesce(_points_win,3), coalesce(_points_draw,1), coalesce(_points_loss,0),
     coalesce(_allow_draw,false),
     coalesce(_tiebreakers, array['sets_ganhos','pontos_ganhos','pontos_sofridos_asc']),
     coalesce(_has_third_place,false), 'rascunho', _uid)
  returning id into _cid;

  -- stage grupos
  insert into public.championship_stages
    (championship_id, name, ordering, kind, counting, rounds,
     sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes)
  values
    (_cid, 'Fase de Grupos', 0, 'grupos',
     coalesce(_groups_counting,'set')::counting_system,
     coalesce(_groups_rounds,1), coalesce(_groups_sets_to_play,3),
     coalesce(_groups_points_per_set,11), coalesce(_groups_win_by_two,true),
     coalesce(_groups_set_draw_enabled,false), _groups_time_minutes)
  returning id into _stage_grupos_id;

  -- stage repescagem (se qualificados ímpares)
  if _has_repechage then
    insert into public.championship_stages
      (championship_id, name, ordering, kind, counting, rounds,
       sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes)
    values
      (_cid, 'Repescagem', 0.5, 'triangular',
       coalesce(_groups_counting,'set')::counting_system,
       1, coalesce(_groups_sets_to_play,3), coalesce(_groups_points_per_set,11),
       coalesce(_groups_win_by_two,true), coalesce(_groups_set_draw_enabled,false),
       _groups_time_minutes)
    returning id into _stage_rep_id;
  end if;

  -- stage eliminatória
  insert into public.championship_stages
    (championship_id, name, ordering, kind, counting, rounds,
     sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes)
  values
    (_cid, 'Eliminatórias', 1, 'eliminatoria',
     coalesce(_elim_counting,'set')::counting_system,
     1, coalesce(_elim_sets_to_play,3), coalesce(_elim_points_per_set,11),
     coalesce(_elim_win_by_two,true), coalesce(_elim_set_draw_enabled,false),
     _elim_time_minutes)
  returning id into _stage_elim_id;

  -- cria grupos
  _group_ids := array[]::uuid[];
  for _g in 1.._num_groups loop
    declare _gid uuid;
    begin
      insert into public.groups (stage_id, name, ordering)
        values (_stage_grupos_id,
                coalesce(_group_names[_g], 'Grupo '||_g::text), _g-1)
        returning id into _gid;
      _group_ids := array_append(_group_ids, _gid);
    end;
  end loop;

  -- insere participantes + snake draft
  _cur_group := 1; _snake_dir := 1;
  for _i in 1.._n loop
    insert into public.participants
      (championship_id, kind, enrollment_source, enrollment_status,
       seed, group_id)
    values
      (_cid, 'player', 'organizador', 'confirmado',
       _seeds[_i], _group_ids[_cur_group])
    returning id into _pid;
    insert into public.participant_members (participant_id, user_id)
      values (_pid, _player_ids[_i]);

    -- avança snake
    _cur_group := _cur_group + _snake_dir;
    if _cur_group > _num_groups then
      _snake_dir := -1; _cur_group := _num_groups;
    elsif _cur_group < 1 then
      _snake_dir := 1; _cur_group := 1;
    end if;
  end loop;

  -- ativa (trigger cuida da geração dos jogos de grupos)
  update public.championships set status='ativo' where id=_cid;
  return _cid;
end; $$;

-- ===== Geração dos jogos da fase de grupos =====
create or replace function public.generate_groups_phase_matches(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _stage_id uuid; _g record; _rounds int;
  _parts uuid[]; _n int; _i int; _j int; _r int;
  _created int := 0; _stage_kind text;
begin
  select id, rounds, kind into _stage_id, _rounds, _stage_kind
  from public.championship_stages
  where championship_id=_championship_id
    and kind in ('grupos','triangular')
    and ordering=(
      select min(ordering) from public.championship_stages
      where championship_id=_championship_id and kind in ('grupos','triangular')
    );
  if _stage_id is null then return 0; end if;

  for _g in select * from public.groups where stage_id=_stage_id loop
    select array_agg(id order by coalesce(seed,9999), created_at)
    into _parts
    from public.participants
    where championship_id=_championship_id
      and group_id=_g.id
      and enrollment_status='confirmado';

    _n := coalesce(array_length(_parts,1),0);
    if _n < 2 then continue; end if;

    for _r in 1.._rounds loop
      for _i in 1.._n loop
        for _j in (_i+1).._n loop
          insert into public.matches
            (championship_id, stage_id, group_id, round,
             side_a_participant_id, side_b_participant_id, status)
          values (_championship_id, _stage_id, _g.id, _r,
                  _parts[_i], _parts[_j], 'agendado');
          _created := _created + 1;
        end loop;
      end loop;
    end loop;
  end loop;
  return _created;
end; $$;

-- ===== Geração do bracket a partir dos grupos =====
create or replace function public.generate_bracket_from_groups(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _elim_stage_id uuid; _grupos_stage_id uuid;
  _groups uuid[]; _ng int;
  _qualifiers_per_group int;
  _all_qualifiers uuid[]; -- participantes que avançam, em ordem de seeding do bracket
  _g_standings record;
  _gi int; _qi int; _pos int;
  _bracket_qualifiers uuid[];
  _temp uuid;
  _created int := 0;
  _champ record;
  _total_q int;
begin
  select * into _champ from public.championships where id=_championship_id;

  -- stage de grupos
  select id into _grupos_stage_id from public.championship_stages
    where championship_id=_championship_id and kind='grupos';

  -- stage de eliminatória
  select id into _elim_stage_id from public.championship_stages
    where championship_id=_championship_id and kind='eliminatoria';
  if _elim_stage_id is null then return 0; end if;

  -- lista grupos
  select array_agg(id order by ordering) into _groups
    from public.groups where stage_id=_grupos_stage_id;
  _ng := coalesce(array_length(_groups,1),0);
  if _ng=0 then return 0; end if;

  -- quantos se classificam por grupo (inferido: total_qualifiers / ng, arredondado p/ cima)
  -- usamos a contagem de participantes do primeiro grupo como referência
  select count(*) into _qualifiers_per_group
    from public.participants
    where championship_id=_championship_id
      and group_id=_groups[1]
      and enrollment_status='confirmado';
  -- na verdade qualifiers_per_group é configurado no campeonato — usamos metade dos membros do grupo como default
  -- Para flexibilidade: inferimos como ceil(membros/2) se não tiver campo dedicado
  -- TODO fase posterior: adicionar qualifiers_per_group em championship_stages
  _qualifiers_per_group := ceil(_qualifiers_per_group::float / 2);

  -- coleta top-N de cada grupo via get_standings filtrado por group
  -- monta array de qualificados na ordem para cross-seeding
  -- cross-seeding: 1ºA vs últimoB, 1ºB vs últimoA, 2ºA vs 2ºúltimoB ...
  _all_qualifiers := array[]::uuid[];
  for _gi in 1.._ng loop
    _qi := 0;
    for _g_standings in
      select s.participant_id
      from public.get_standings(_championship_id) s
      join public.participants p on p.id=s.participant_id
      where p.group_id=_groups[_gi]
      order by s."position" asc
      limit _qualifiers_per_group
    loop
      _all_qualifiers := array_append(_all_qualifiers, _g_standings.participant_id);
      _qi := _qi + 1;
    end loop;
  end loop;

  _total_q := coalesce(array_length(_all_qualifiers,1),0);
  if _total_q < 2 then return 0; end if;

  -- cross-seeding: intercala grupos (1ºA, 1ºB, 1ºC..., 2ºA, 2ºB...)
  -- já está nessa ordem pelo loop acima
  -- reordena para bracket: posições opostas (1º vs último, 2º vs penúltimo)
  _bracket_qualifiers := array_fill(null::uuid, array[_total_q]);
  for _qi in 1.._total_q loop
    if _qi % 2 = 1 then
      _bracket_qualifiers[_qi] := _all_qualifiers[_qi];
    else
      _bracket_qualifiers[_total_q + 1 - _qi] := _all_qualifiers[_qi];
    end if;
  end loop;

  -- injeta como participants com seed para o bracket
  for _qi in 1.._total_q loop
    update public.participants
      set seed=_qi
      where id=_bracket_qualifiers[_qi];
  end loop;

  -- gera o bracket usando a função existente (já usa seeds)
  -- temporariamente ajusta stage_id dos participants para apontar ao stage de elim
  -- (generate_bracket_matches usa stage ordering=0 — precisa ser o elim stage agora)
  -- solução: gerar diretamente sem delegar, ou ajustar ordering
  -- SOLUÇÃO LIMPA: chama generate_bracket_matches após setar o elim stage como ordering=0 temporariamente
  -- ALTERNATIVA: cria matches diretamente nesta função usando _elim_stage_id
  -- Usamos a alternativa para não mexer no ordering:
  declare
    _size int := 1; _i int; _j int; _round int; _half int;
    _slots uuid[];
    _lo int; _hi int; _toggle boolean;
    _positions int[];
    _filled uuid[];
    _match_id uuid; _ma uuid; _mb uuid;
    _cur_round_ids uuid[]; _next_round_ids uuid[];
  begin
    while _size < _total_q loop _size := _size * 2; end loop;

    -- distribui seeds ATP
    _positions := array[]::int[]; _lo := 1; _hi := _size; _toggle := true;
    for _i in 1.._size loop
      if _toggle then _positions := array_append(_positions, _lo); _lo:=_lo+1;
      else _positions := array_append(_positions, _hi); _hi:=_hi-1; end if;
      _toggle := not _toggle;
    end loop;

    _filled := array_fill(null::uuid, array[_size]);
    for _i in 1.._size loop
      if _i <= _total_q then _filled[_positions[_i]] := _bracket_qualifiers[_i]; end if;
    end loop;

    _cur_round_ids := array[]::uuid[];
    _i := 1;
    while _i <= _size loop
      _ma := _filled[_i]; _mb := _filled[_i+1];
      if _ma is null and _mb is null then
        _cur_round_ids := array_append(_cur_round_ids, null);
      elsif _ma is null then
        insert into public.matches (championship_id, stage_id, round, bracket_slot, side_a_participant_id, side_b_participant_id, status, result)
          values (_championship_id, _elim_stage_id, 1, (_i+1)/2, null, _mb, 'finalizado', 'lado_b'::match_result) returning id into _match_id;
        _cur_round_ids := array_append(_cur_round_ids, _match_id); _created:=_created+1;
      elsif _mb is null then
        insert into public.matches (championship_id, stage_id, round, bracket_slot, side_a_participant_id, side_b_participant_id, status, result)
          values (_championship_id, _elim_stage_id, 1, (_i+1)/2, _ma, null, 'finalizado', 'lado_a'::match_result) returning id into _match_id;
        _cur_round_ids := array_append(_cur_round_ids, _match_id); _created:=_created+1;
      else
        insert into public.matches (championship_id, stage_id, round, bracket_slot, side_a_participant_id, side_b_participant_id, status)
          values (_championship_id, _elim_stage_id, 1, (_i+1)/2, _ma, _mb, 'agendado') returning id into _match_id;
        _cur_round_ids := array_append(_cur_round_ids, _match_id); _created:=_created+1;
      end if;
      _i := _i + 2;
    end loop;

    _round := 2; _half := _size / 2;
    while _half >= 2 loop
      _next_round_ids := array[]::uuid[];
      _i := 1;
      while _i <= array_length(_cur_round_ids,1) loop
        insert into public.matches (championship_id, stage_id, round, bracket_slot, status)
          values (_championship_id, _elim_stage_id, _round, (_i+1)/2, 'agendado') returning id into _match_id;
        _next_round_ids := array_append(_next_round_ids, _match_id);
        if _cur_round_ids[_i] is not null then update public.matches set winner_advances_to=_match_id where id=_cur_round_ids[_i]; end if;
        if _cur_round_ids[_i+1] is not null then update public.matches set winner_advances_to=_match_id where id=_cur_round_ids[_i+1]; end if;
        _created:=_created+1; _i:=_i+2;
      end loop;
      _cur_round_ids := _next_round_ids; _round:=_round+1; _half:=_half/2;
    end loop;

    if _champ.has_third_place and array_length(_cur_round_ids,1) >= 2 then
      insert into public.matches (championship_id, stage_id, round, bracket_slot, status)
        values (_championship_id, _elim_stage_id, _round-1, -2, 'agendado');
      _created:=_created+1;
    end if;
  end;

  perform public.propagate_bracket_advances(_championship_id);
  return _created;
end; $$;

-- ===== Trigger: gera bracket quando todos os jogos de grupos terminam =====
create or replace function public.trg_auto_generate_bracket()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _format text; _pending int; _rep_pending int;
  _has_rep boolean;
begin
  if new.status != 'finalizado' then return new; end if;

  select format into _format from public.championships where id=new.championship_id;
  if _format != 'grupos_elim' then return new; end if;

  -- verifica se ainda há jogos de grupos pendentes
  select count(*) into _pending
  from public.matches m
  join public.championship_stages s on s.id=m.stage_id
  where m.championship_id=new.championship_id
    and s.kind='grupos'
    and m.status != 'finalizado';

  if _pending > 0 then return new; end if;

  -- verifica repescagem
  select exists(
    select 1 from public.championship_stages
    where championship_id=new.championship_id and kind='triangular'
  ) into _has_rep;

  if _has_rep then
    select count(*) into _rep_pending
    from public.matches m
    join public.championship_stages s on s.id=m.stage_id
    where m.championship_id=new.championship_id
      and s.kind='triangular'
      and m.status != 'finalizado';
    if _rep_pending > 0 then return new; end if;
  end if;

  -- todos os grupos (e repescagem) finalizados: gera bracket
  if not exists(
    select 1 from public.matches m
    join public.championship_stages s on s.id=m.stage_id
    where m.championship_id=new.championship_id and s.kind='eliminatoria'
  ) then
    perform public.generate_bracket_from_groups(new.championship_id);
  end if;

  return new;
end; $$;
drop trigger if exists auto_generate_bracket on public.matches;
create trigger auto_generate_bracket
  after update of status on public.matches
  for each row execute function public.trg_auto_generate_bracket();

-- ===== Atualiza trg_championship_status para cobrir grupos_elim =====
create or replace function public.trg_championship_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare _has_finished boolean; _generated int;
begin
  if new.status='ativo' and old.status is distinct from 'ativo' then
    if new.format='liga' or (new.format='desafio' and new.unit='player') then
      perform public.generate_liga_matches(new.id);
    elsif new.format='desafio' and new.unit='team' then
      perform public.generate_team_challenge_matches(new.id);
    elsif new.format='eliminatoria' then
      perform public.generate_bracket_matches(new.id);
    elsif new.format='grupos_elim' then
      perform public.generate_groups_phase_matches(new.id);
    end if;
  end if;
  if new.status='rascunho' and old.status='ativo' then
    select exists(select 1 from public.matches
      where championship_id=new.id and status='finalizado')
    into _has_finished;
    if _has_finished then
      raise exception 'nao e possivel voltar para rascunho: ha jogo realizado';
    end if;
    delete from public.matches where championship_id=new.id;
  end if;
  return new;
end; $$;

grant execute on function public.create_grupos_elim_championship to authenticated;
grant execute on function public.generate_groups_phase_matches(uuid) to authenticated;
grant execute on function public.generate_bracket_from_groups(uuid) to authenticated;
