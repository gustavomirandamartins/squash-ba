-- ===== Alternância de lados no round-robin da liga =====
-- Rodadas ímpares: A×B | Rodadas pares: B×A
-- Garante que cada par joga uma vez como "mandante" em cada ciclo de 2 rodadas.

create or replace function public.generate_liga_matches(
  _championship_id uuid,
  _stage_id        uuid,
  _rounds          int
) returns int language plpgsql security definer set search_path = public as $$
declare
  _parts   uuid[];
  _n       int;
  _r       int;
  _i       int;
  _j       int;
  _created int := 0;
  _side_a  uuid;
  _side_b  uuid;
begin
  select array_agg(id order by created_at)
    into _parts
    from public.participants
    where championship_id=_championship_id and enrollment_status='confirmado';
  _n := coalesce(array_length(_parts,1),0);

  delete from public.matches where championship_id=_championship_id;
  if _n < 2 then return 0; end if;

  for _r in 1.._rounds loop
    for _i in 1.._n loop
      for _j in (_i+1).._n loop
        -- Rodadas pares invertem os lados (home/away alternado)
        if _r % 2 = 0 then
          _side_a := _parts[_j];
          _side_b := _parts[_i];
        else
          _side_a := _parts[_i];
          _side_b := _parts[_j];
        end if;
        insert into public.matches
          (championship_id, stage_id, round, side_a_participant_id, side_b_participant_id, status)
        values (_championship_id, _stage_id, _r, _side_a, _side_b, 'agendado');
        _created := _created + 1;
      end loop;
    end loop;
  end loop;
  return _created;
end; $$;
