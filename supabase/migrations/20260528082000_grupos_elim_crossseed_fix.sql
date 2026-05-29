-- Fix: algoritmo de cross-seeding em generate_bracket_from_groups estava sobrescrevendo
-- posição 1 para _total_q par. Substituído por: coleta qualificados posição a posição
-- atravessando os grupos (1ºA,1ºB,...,2ºA,2ºB,...) e usa o array diretamente sem rearranjo.
-- Para N grupos × Q classificados por grupo, o ATP seeding já distribui cross-group.

create or replace function public.generate_bracket_from_groups(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _elim_stage_id uuid; _grupos_stage_id uuid;
  _groups uuid[]; _ng int;
  _qualifiers_per_group int;
  _all_qualifiers uuid[];
  _g_standings record;
  _gi int; _qi int; _pos_num int;
  _part_id uuid;
  _created int := 0;
  _champ record;
  _total_q int;
  -- bracket vars
  _size int; _i int; _round int; _half int;
  _lo int; _hi int; _toggle boolean;
  _positions int[];
  _filled uuid[];
  _match_id uuid; _ma uuid; _mb uuid;
  _cur_round_ids uuid[]; _next_round_ids uuid[];
begin
  select * into _champ from public.championships where id=_championship_id;

  select id into _grupos_stage_id from public.championship_stages
    where championship_id=_championship_id and kind='grupos';

  select id into _elim_stage_id from public.championship_stages
    where championship_id=_championship_id and kind='eliminatoria';
  if _elim_stage_id is null then return 0; end if;

  select array_agg(id order by ordering) into _groups
    from public.groups where stage_id=_grupos_stage_id;
  _ng := coalesce(array_length(_groups,1),0);
  if _ng=0 then return 0; end if;

  -- quantos classificados por grupo: ceil(membros_primeiro_grupo / 2)
  select count(*) into _qualifiers_per_group
    from public.participants
    where championship_id=_championship_id
      and group_id=_groups[1]
      and enrollment_status='confirmado';
  _qualifiers_per_group := ceil(_qualifiers_per_group::float / 2);

  -- Coleta qualificados posição a posição através dos grupos:
  -- [1ºA, 1ºB, ..., 2ºA, 2ºB, ...] → ATP seeding garante cross-group
  _all_qualifiers := array[]::uuid[];
  for _pos_num in 1.._qualifiers_per_group loop
    for _gi in 1.._ng loop
      select s.participant_id into _part_id
      from public.get_standings(_championship_id) s
      join public.participants p on p.id=s.participant_id
      where p.group_id=_groups[_gi]
      order by s."position" asc
      offset (_pos_num - 1) limit 1;

      if _part_id is not null then
        _all_qualifiers := array_append(_all_qualifiers, _part_id);
      end if;
    end loop;
  end loop;

  _total_q := coalesce(array_length(_all_qualifiers,1),0);
  if _total_q < 2 then return 0; end if;

  -- Sem rearranjo adicional: _all_qualifiers já está na ordem correta para ATP
  -- (todos os 1ºs primeiro, depois todos os 2ºs, etc.)
  -- NOTE: não faz UPDATE em participants (trg_participants_guard bloqueia quando ativo).

  -- Gera bracket com _elim_stage_id
  _size := 1;
  while _size < _total_q loop _size := _size * 2; end loop;

  -- ATP seeding iterativo
  _positions := array[]::int[]; _lo := 1; _hi := _size; _toggle := true;
  for _i in 1.._size loop
    if _toggle then _positions := array_append(_positions, _lo); _lo:=_lo+1;
    else _positions := array_append(_positions, _hi); _hi:=_hi-1; end if;
    _toggle := not _toggle;
  end loop;

  _filled := array_fill(null::uuid, array[_size]);
  for _i in 1.._size loop
    if _i <= _total_q then _filled[_positions[_i]] := _all_qualifiers[_i]; end if;
  end loop;

  -- Round 1
  _cur_round_ids := array[]::uuid[];
  _i := 1;
  while _i <= _size loop
    _ma := _filled[_i]; _mb := _filled[_i+1];
    if _ma is null and _mb is null then
      _cur_round_ids := array_append(_cur_round_ids, null);
    elsif _ma is null then
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status, result)
        values (_championship_id, _elim_stage_id, 1, (_i+1)/2,
                null, _mb, 'finalizado', 'lado_b'::match_result)
        returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id); _created:=_created+1;
    elsif _mb is null then
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status, result)
        values (_championship_id, _elim_stage_id, 1, (_i+1)/2,
                _ma, null, 'finalizado', 'lado_a'::match_result)
        returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id); _created:=_created+1;
    else
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status)
        values (_championship_id, _elim_stage_id, 1, (_i+1)/2,
                _ma, _mb, 'agendado')
        returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id); _created:=_created+1;
    end if;
    _i := _i + 2;
  end loop;

  -- Rounds subsequentes
  _round := 2; _half := _size / 2;
  while _half >= 2 loop
    _next_round_ids := array[]::uuid[];
    _i := 1;
    while _i <= array_length(_cur_round_ids,1) loop
      insert into public.matches (championship_id, stage_id, round, bracket_slot, status)
        values (_championship_id, _elim_stage_id, _round, (_i+1)/2, 'agendado')
        returning id into _match_id;
      _next_round_ids := array_append(_next_round_ids, _match_id);
      if _cur_round_ids[_i]   is not null then
        update public.matches set winner_advances_to=_match_id where id=_cur_round_ids[_i];
      end if;
      if _cur_round_ids[_i+1] is not null then
        update public.matches set winner_advances_to=_match_id where id=_cur_round_ids[_i+1];
      end if;
      _created:=_created+1; _i:=_i+2;
    end loop;
    _cur_round_ids := _next_round_ids; _round:=_round+1; _half:=_half/2;
  end loop;

  -- Bronze
  if _champ.has_third_place and array_length(_cur_round_ids,1) >= 2 then
    insert into public.matches (championship_id, stage_id, round, bracket_slot, status)
      values (_championship_id, _elim_stage_id, _round-1, -2, 'agendado');
    _created:=_created+1;
  end if;

  perform public.propagate_bracket_advances(_championship_id);
  return _created;
end; $$;
