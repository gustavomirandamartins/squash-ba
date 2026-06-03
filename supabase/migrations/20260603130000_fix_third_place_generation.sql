-- ============================================================================
-- Fix #11: o jogo de 3º lugar (bronze) nunca era gerado.
-- ============================================================================
-- A guarda usava `array_length(_cur_round_ids,1) >= 2`, mas ao fim do laço de
-- rounds `_cur_round_ids` SEMPRE contém apenas a final (1 elemento) — então a
-- condição nunca era verdadeira e o match bronze (bracket_slot=-2) não nascia,
-- tanto na eliminatória pura quanto em grupos+eliminatória.
--
-- Correto: existe disputa de 3º lugar quando há semifinais, i.e. o bracket tem
-- pelo menos 4 posições (`_size >= 4`). A rodada do bronze segue `_round - 1`
-- (mesma rodada da final), e propagate_bracket_advances preenche os perdedores
-- das semifinais. Campeonatos já ativados antes deste fix não recebem o bronze
-- retroativamente — recrie/reative para gerar.
-- ============================================================================

-- ===== Eliminatória pura =====
create or replace function public.generate_bracket_matches(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _stage_id uuid;
  _n int; _size int;
  _slots uuid[];
  _i int; _round int; _half int;
  _created int := 0;
  _match_id uuid;
  _has_finished boolean;
  _has_third boolean;
  _cur_round_ids uuid[];
  _next_round_ids uuid[];
  _ma uuid; _mb uuid;
  _pairs_a int[]; _pairs_b int[];
  _new_a  int[]; _new_b  int[];
  _cur_size int;
begin
  select exists(select 1 from public.matches
    where championship_id=_championship_id and status='finalizado')
  into _has_finished;
  if _has_finished then
    raise exception 'campeonato ja iniciado: nao e possivel regenerar os jogos';
  end if;

  select id into _stage_id from public.championship_stages
    where championship_id=_championship_id order by ordering limit 1;
  if _stage_id is null then return 0; end if;

  select has_third_place into _has_third
    from public.championships where id=_championship_id;

  select array_agg(p.id order by coalesce(p.seed,9999), p.created_at)
  into _slots
  from public.participants p
  where p.championship_id=_championship_id and p.enrollment_status='confirmado';

  _n := coalesce(array_length(_slots,1), 0);
  if _n < 2 then return 0; end if;

  if _n = 3 then
    return public.generate_liga_matches(_championship_id);
  end if;

  _size := 1;
  while _size < _n loop _size := _size * 2; end loop;

  delete from public.matches where championship_id=_championship_id;

  _pairs_a := array[1];
  _pairs_b := array[2];
  _cur_size := 2;
  while _cur_size < _size loop
    _new_a := array[]::int[];
    _new_b := array[]::int[];
    for _i in 1..array_length(_pairs_a, 1) loop
      _new_a := array_append(_new_a, _pairs_a[_i]);
      _new_b := array_append(_new_b, _cur_size * 2 + 1 - _pairs_a[_i]);
      _new_a := array_append(_new_a, _cur_size * 2 + 1 - _pairs_b[_i]);
      _new_b := array_append(_new_b, _pairs_b[_i]);
    end loop;
    _pairs_a := _new_a;
    _pairs_b := _new_b;
    _cur_size := _cur_size * 2;
  end loop;

  _cur_round_ids := array[]::uuid[];
  for _i in 1..(_size / 2) loop
    _ma := case when _pairs_a[_i] <= _n then _slots[_pairs_a[_i]] else null end;
    _mb := case when _pairs_b[_i] <= _n then _slots[_pairs_b[_i]] else null end;

    if _ma is null and _mb is null then
      _cur_round_ids := array_append(_cur_round_ids, null);
    elsif _ma is null then
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status, result)
      values (_championship_id, _stage_id, 1, _i,
              null, _mb, 'finalizado', 'lado_b')
      returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id);
      _created := _created + 1;
    elsif _mb is null then
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status, result)
      values (_championship_id, _stage_id, 1, _i,
              _ma, null, 'finalizado', 'lado_a')
      returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id);
      _created := _created + 1;
    else
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status)
      values (_championship_id, _stage_id, 1, _i,
              _ma, _mb, 'agendado')
      returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id);
      _created := _created + 1;
    end if;
  end loop;

  _round := 2;
  _half := _size / 2;
  while _half >= 2 loop
    _next_round_ids := array[]::uuid[];
    _i := 1;
    while _i <= array_length(_cur_round_ids, 1) loop
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot, status)
      values (_championship_id, _stage_id, _round, (_i + 1) / 2, 'agendado')
      returning id into _match_id;
      _next_round_ids := array_append(_next_round_ids, _match_id);
      if _cur_round_ids[_i] is not null then
        update public.matches set winner_advances_to = _match_id
          where id = _cur_round_ids[_i];
      end if;
      if _cur_round_ids[_i + 1] is not null then
        update public.matches set winner_advances_to = _match_id
          where id = _cur_round_ids[_i + 1];
      end if;
      _created := _created + 1;
      _i := _i + 2;
    end loop;
    _cur_round_ids := _next_round_ids;
    _round := _round + 1;
    _half := _half / 2;
  end loop;

  -- ── Match de bronze (3º lugar): existe quando há semifinais (_size >= 4) ──
  if _has_third and _size >= 4 then
    insert into public.matches
      (championship_id, stage_id, round, bracket_slot, status)
    values (_championship_id, _stage_id, _round - 1, -2, 'agendado')
    returning id into _match_id;
    _created := _created + 1;
  end if;

  perform public.propagate_bracket_advances(_championship_id);

  return _created;
end; $$;

-- ===== Grupos + Eliminatória =====
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

  select count(*) into _qualifiers_per_group
    from public.participants
    where championship_id=_championship_id
      and group_id=_groups[1]
      and enrollment_status='confirmado';
  _qualifiers_per_group := ceil(_qualifiers_per_group::float / 2);

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

  _size := 1;
  while _size < _total_q loop _size := _size * 2; end loop;

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

  -- ── Bronze: existe quando há semifinais (_size >= 4) ──
  if _champ.has_third_place and _size >= 4 then
    insert into public.matches (championship_id, stage_id, round, bracket_slot, status)
      values (_championship_id, _elim_stage_id, _round-1, -2, 'agendado');
    _created:=_created+1;
  end if;

  perform public.propagate_bracket_advances(_championship_id);
  return _created;
end; $$;

grant execute on function public.generate_bracket_matches(uuid) to authenticated;
grant execute on function public.generate_bracket_from_groups(uuid) to authenticated;
