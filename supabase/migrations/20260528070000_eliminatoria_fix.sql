-- ===== Corrige generate_bracket_matches: seeding ATP correto =====
-- Problema: algoritmo anterior colocava byes nos seeds do meio (5,6).
-- Correto ATP: seed k enfrenta seed (S+1-k), então seeds 1 e 2 recebem
-- os byes quando N<S (posições dos seeds ausentes são adjacentes a eles).
-- Algoritmo: expande pares (1,2) iterativamente. A cada duplicação de tamanho,
-- cada par (a,b) gera (a, 2S+1-a) e (2S+1-b, b), preservando a simetria ATP.

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
  -- ATP bracket building
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

  -- carrega participantes confirmados ordenados por seed asc nulls last, created_at
  select array_agg(p.id order by coalesce(p.seed,9999), p.created_at)
  into _slots
  from public.participants p
  where p.championship_id=_championship_id and p.enrollment_status='confirmado';

  _n := coalesce(array_length(_slots,1), 0);
  if _n < 2 then return 0; end if;

  -- N=3: triangular round-robin
  if _n = 3 then
    return public.generate_liga_matches(_championship_id);
  end if;

  -- próxima potência de 2
  _size := 1;
  while _size < _n loop _size := _size * 2; end loop;

  delete from public.matches where championship_id=_championship_id;

  -- ── Gera pares ATP iterativamente ────────────────────────────────────────
  -- Para bracket de tamanho 2: par único (1, 2)
  -- A cada duplicação para tamanho 2S: cada par (a,b) se expande em
  --   (a, 2S+1-a)  e  (2S+1-b, b)
  -- Resultado para S=4:  (1,4),(3,2)  → matches seed1vs4, seed2vs3
  -- Resultado para S=8:  (1,8),(5,4),(3,6),(7,2) → seed1vs8, seed5vs4, seed3vs6, seed7vs2
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

  -- ── Rodada 1 ─────────────────────────────────────────────────────────────
  -- Para N=6, S=8: pairs_a=[1,5,3,7], pairs_b=[8,4,6,2]
  -- Matches: (s1,null=bye),(s5,s4),(s3,s6),(null=bye,s2)
  -- → seeds 1 e 2 recebem bye ✓
  _cur_round_ids := array[]::uuid[];
  for _i in 1..(_size / 2) loop
    _ma := case when _pairs_a[_i] <= _n then _slots[_pairs_a[_i]] else null end;
    _mb := case when _pairs_b[_i] <= _n then _slots[_pairs_b[_i]] else null end;

    if _ma is null and _mb is null then
      -- dois byes no mesmo slot: não gera match (não ocorre com distribuição ATP)
      _cur_round_ids := array_append(_cur_round_ids, null);
    elsif _ma is null then
      -- bye lado A → lado B avança
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status, result)
      values (_championship_id, _stage_id, 1, _i,
              null, _mb, 'finalizado', 'lado_b')
      returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id);
      _created := _created + 1;
    elsif _mb is null then
      -- bye lado B → lado A avança
      insert into public.matches
        (championship_id, stage_id, round, bracket_slot,
         side_a_participant_id, side_b_participant_id, status, result)
      values (_championship_id, _stage_id, 1, _i,
              _ma, null, 'finalizado', 'lado_a')
      returning id into _match_id;
      _cur_round_ids := array_append(_cur_round_ids, _match_id);
      _created := _created + 1;
    else
      -- match real
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

  -- ── Rounds seguintes (placeholders) ──────────────────────────────────────
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

  -- ── Match de bronze (3º lugar) ────────────────────────────────────────────
  if _has_third and array_length(_cur_round_ids, 1) >= 2 then
    insert into public.matches
      (championship_id, stage_id, round, bracket_slot, status)
    values (_championship_id, _stage_id, _round - 1, -2, 'agendado')
    returning id into _match_id;
    _created := _created + 1;
  end if;

  -- Propaga avanços dos byes imediatamente
  perform public.propagate_bracket_advances(_championship_id);

  return _created;
end; $$;
