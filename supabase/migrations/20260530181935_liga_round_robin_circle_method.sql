-- Round-robin balanceado (método do círculo): cada jogador joga uma vez por
-- rodada, jogos distribuídos em matchdays (não mais todos os pares de um jogador
-- seguidos). Alterna mando (mandante/visitante) por rodada e no returno.
create or replace function public.generate_liga_matches(_championship_id uuid)
returns integer language plpgsql security definer set search_path = public as $function$
declare
  _stage_id uuid; _rounds int; _has_finished boolean;
  _parts uuid[]; _n int; _m int; _half int;
  _slots uuid[]; _created int := 0;
  _cycle int; _md int; _k int;
  _home uuid; _away uuid; _tmp uuid; _swap boolean; _gr int;
begin
  select exists(select 1 from public.matches where championship_id=_championship_id and status='finalizado')
    into _has_finished;
  if _has_finished then
    raise exception 'campeonato ja iniciado: nao e possivel regenerar os jogos';
  end if;

  select id, rounds into _stage_id, _rounds
    from public.championship_stages where championship_id=_championship_id
    order by ordering limit 1;
  if _stage_id is null then return 0; end if;

  select array_agg(id order by created_at) into _parts
    from public.participants
    where championship_id=_championship_id and enrollment_status='confirmado';
  _n := coalesce(array_length(_parts,1),0);

  delete from public.matches where championship_id=_championship_id;
  if _n < 2 then return 0; end if;

  _m := case when _n % 2 = 1 then _n + 1 else _n end;  -- par (com bye se ímpar)
  _half := _m / 2;

  for _cycle in 1.._rounds loop
    -- reinicia os slots no começo de cada ciclo (turno/returno usam o mesmo
    -- agendamento base; só o mando inverte no returno)
    _slots := _parts;
    if _n % 2 = 1 then _slots := _slots || array[null::uuid]; end if;

    for _md in 1..(_m - 1) loop
      _gr := (_cycle - 1) * (_m - 1) + _md;   -- rodada global
      for _k in 1.._half loop
        _home := _slots[_k];
        _away := _slots[_m + 1 - _k];
        if _home is null or _away is null then continue; end if;  -- bye

        -- alternância de mando: inverte em rodadas pares e no returno
        _swap := ((_md % 2) = 0);
        if (_cycle % 2) = 0 then _swap := not _swap; end if;
        if _swap then _tmp := _home; _home := _away; _away := _tmp; end if;

        insert into public.matches
          (championship_id, stage_id, round, side_a_participant_id, side_b_participant_id, status)
        values (_championship_id, _stage_id, _gr, _home, _away, 'agendado');
        _created := _created + 1;
      end loop;

      -- rotação do método do círculo: fixa slots[1], rotaciona slots[2..m]
      _tmp := _slots[_m];
      for _k in reverse _m..3 loop
        _slots[_k] := _slots[_k - 1];
      end loop;
      _slots[2] := _tmp;
    end loop;
  end loop;

  return _created;
end; $function$;
