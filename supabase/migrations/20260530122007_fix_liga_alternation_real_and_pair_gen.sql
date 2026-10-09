-- Corrige regressão: a migration 20260529160000 criou um OVERLOAD de
-- generate_liga_matches(uuid,uuid,int) que nunca era chamado — o trigger usa a
-- versão de 1 argumento. Aqui aplicamos a alternância de lados na função correta,
-- removemos o overload morto e habilitamos geração para desafios de duplas.

create or replace function public.generate_liga_matches(_championship_id uuid)
returns integer language plpgsql security definer set search_path = public as $function$
declare
  _stage_id uuid; _rounds int; _has_finished boolean;
  _parts uuid[]; _n int; _i int; _j int; _r int; _created int := 0;
  _side_a uuid; _side_b uuid;
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

  for _r in 1.._rounds loop
    for _i in 1.._n loop
      for _j in (_i+1).._n loop
        if _r % 2 = 0 then
          _side_a := _parts[_j]; _side_b := _parts[_i];
        else
          _side_a := _parts[_i]; _side_b := _parts[_j];
        end if;
        insert into public.matches
          (championship_id, stage_id, round, side_a_participant_id, side_b_participant_id, status)
        values (_championship_id, _stage_id, _r, _side_a, _side_b, 'agendado');
        _created := _created + 1;
      end loop;
    end loop;
  end loop;
  return _created;
end; $function$;

drop function if exists public.generate_liga_matches(uuid, uuid, integer);

create or replace function public.trg_championship_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare _has_finished boolean; _generated int;
begin
  if new.status='ativo' and old.status is distinct from 'ativo' then
    if new.format='liga'
       or (new.format='desafio' and new.unit in ('player','pair')) then
      perform public.generate_liga_matches(new.id);
    elsif new.format='desafio' and new.unit='team' then
      select public.generate_team_challenge_matches(new.id) into _generated;
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
