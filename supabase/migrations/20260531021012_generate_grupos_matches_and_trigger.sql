-- #7 — Geração dos jogos da fase de grupos (round-robin por grupo).
-- Antes: trg_championship_status não tratava 'grupos_elim', então nenhum jogo
-- de grupo era criado ao ativar (ex.: 2 grupos × 2 jogadores = 0 jogos).
create or replace function public.generate_grupos_matches(_championship_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _stage_id uuid; _rounds int; _has_finished boolean;
  _grp record; _parts uuid[]; _n int; _m int; _half int; _slots uuid[];
  _created int := 0; _cycle int; _md int; _k int;
  _home uuid; _away uuid; _tmp uuid; _swap boolean; _gr int;
begin
  select exists(select 1 from public.matches
    where championship_id=_championship_id and status='finalizado')
  into _has_finished;
  if _has_finished then
    raise exception 'campeonato ja iniciado: nao e possivel regenerar os jogos';
  end if;

  select id, rounds into _stage_id, _rounds
    from public.championship_stages
    where championship_id=_championship_id and kind='grupos'
    order by ordering limit 1;
  if _stage_id is null then return 0; end if;

  -- limpa apenas os jogos da fase de grupos
  delete from public.matches
    where championship_id=_championship_id and stage_id=_stage_id;

  for _grp in
    select id from public.groups where stage_id=_stage_id order by ordering
  loop
    select array_agg(p.id order by p.created_at) into _parts
      from public.participants p
      where p.championship_id=_championship_id
        and p.enrollment_status='confirmado'
        and p.group_id=_grp.id;
    _n := coalesce(array_length(_parts,1),0);
    if _n < 2 then continue; end if;

    _m := case when _n % 2 = 1 then _n + 1 else _n end;  -- par (bye se ímpar)
    _half := _m / 2;

    for _cycle in 1.._rounds loop
      _slots := _parts;
      if _n % 2 = 1 then _slots := _slots || array[null::uuid]; end if;
      for _md in 1..(_m - 1) loop
        _gr := (_cycle - 1) * (_m - 1) + _md;  -- rodada global
        for _k in 1.._half loop
          _home := _slots[_k];
          _away := _slots[_m + 1 - _k];
          if _home is null or _away is null then continue; end if;
          _swap := ((_md % 2) = 0);
          if (_cycle % 2) = 0 then _swap := not _swap; end if;
          if _swap then _tmp := _home; _home := _away; _away := _tmp; end if;
          insert into public.matches
            (championship_id, stage_id, group_id, round,
             side_a_participant_id, side_b_participant_id, status)
          values
            (_championship_id, _stage_id, _grp.id, _gr, _home, _away, 'agendado');
          _created := _created + 1;
        end loop;
        -- rotação círculo: fixa slots[1], rotaciona slots[2..m]
        _tmp := _slots[_m];
        for _k in reverse _m..3 loop _slots[_k] := _slots[_k - 1]; end loop;
        _slots[2] := _tmp;
      end loop;
    end loop;
  end loop;

  return _created;
end; $function$;

-- Atualiza o trigger para gerar jogos de grupos ao ativar grupos_elim.
create or replace function public.trg_championship_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare _has_finished boolean; _generated int;
begin
  if new.status='ativo' and old.status is distinct from 'ativo' then
    if new.format='liga'
       or (new.format='desafio' and new.unit in ('player','pair')) then
      perform public.generate_liga_matches(new.id);
    elsif new.format='desafio' and new.unit='team' then
      select public.generate_team_challenge_matches(new.id) into _generated;
    elsif new.format='eliminatoria' then
      perform public.generate_bracket_matches(new.id);
    elsif new.format='grupos_elim' then
      perform public.generate_grupos_matches(new.id);
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
end; $function$;

-- Backfill: campeonatos grupos_elim já ativos e sem jogos (criados antes da correção).
do $$
declare c record;
begin
  for c in
    select ch.id from public.championships ch
    where ch.format='grupos_elim' and ch.status='ativo'
      and not exists (select 1 from public.matches m where m.championship_id=ch.id)
  loop
    perform public.generate_grupos_matches(c.id);
  end loop;
end $$;
