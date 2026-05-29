-- Fix: generate_bracket_from_groups não pode fazer UPDATE em participants quando status='ativo'
-- (trg_participants_guard bloqueia). O array _bracket_qualifiers já carrega a ordem correta —
-- remover o loop de seed update; o código de geração do bracket usa o array diretamente.

create or replace function public.generate_bracket_from_groups(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _elim_stage_id uuid; _grupos_stage_id uuid;
  _groups uuid[]; _ng int;
  _qualifiers_per_group int;
  _all_qualifiers uuid[];
  _g_standings record;
  _gi int; _qi int;
  _bracket_qualifiers uuid[];
  _created int := 0;
  _champ record;
  _total_q int;
  -- bracket local vars
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

  -- qualifiers_per_group: ceil(membros_primeiro_grupo / 2)
  select count(*) into _qualifiers_per_group
    from public.participants
    where championship_id=_championship_id
      and group_id=_groups[1]
      and enrollment_status='confirmado';
  _qualifiers_per_group := ceil(_qualifiers_per_group::float / 2);

  -- coleta top-N de cada grupo via get_standings
  _all_qualifiers := array[]::uuid[];
  for _gi in 1.._ng loop
    for _g_standings in
      select s.participant_id
      from public.get_standings(_championship_id) s
      join public.participants p on p.id=s.participant_id
      where p.group_id=_groups[_gi]
      order by s."position" asc
      limit _qualifiers_per_group
    loop
      _all_qualifiers := array_append(_all_qualifiers, _g_standings.participant_id);
    end loop;
  end loop;

  _total_q := coalesce(array_length(_all_qualifiers,1),0);
  if _total_q < 2 then return 0; end if;

  -- cross-seeding: reordena para bracket (1º vs último, 2º vs penúltimo)
  _bracket_qualifiers := array_fill(null::uuid, array[_total_q]);
  for _qi in 1.._total_q loop
    if _qi % 2 = 1 then
      _bracket_qualifiers[_qi] := _all_qualifiers[_qi];
    else
      _bracket_qualifiers[_total_q + 1 - _qi] := _all_qualifiers[_qi];
    end if;
  end loop;

  -- NOTE: não faz UPDATE em participants (trg_participants_guard bloqueia quando ativo).
  -- A ordem em _bracket_qualifiers já define o seeding do bracket.

  -- Gera bracket diretamente com _elim_stage_id
  _size := 1;
  while _size < _total_q loop _size := _size * 2; end loop;

  -- distribui seeds ATP (iterativo)
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

  _round := 2; _half := _size / 2;
  while _half >= 2 loop
    _next_round_ids := array[]::uuid[];
    _i := 1;
    while _i <= array_length(_cur_round_ids,1) loop
      insert into public.matches (championship_id, stage_id, round, bracket_slot, status)
        values (_championship_id, _elim_stage_id, _round, (_i+1)/2, 'agendado')
        returning id into _match_id;
      _next_round_ids := array_append(_next_round_ids, _match_id);
      if _cur_round_ids[_i]   is not null then update public.matches set winner_advances_to=_match_id where id=_cur_round_ids[_i];   end if;
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

  perform public.propagate_bracket_advances(_championship_id);
  return _created;
end; $$;
