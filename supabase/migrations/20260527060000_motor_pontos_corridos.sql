-- ===== RESOLUÇÃO DA PARTIDA =====
create or replace function public.resolve_match(_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; st record; g record;
  _P int; _need int;
  _sa int := 0; _sb int := 0; _sd int := 0; _gc int := 0;
  _res match_result; _status match_status;
begin
  select * into m from public.matches where id = _match_id;
  if not found or m.stage_id is null then return; end if;
  select * into st from public.championship_stages where id = m.stage_id;

  if st.counting = 'tempo' then
    select * into g from public.match_games where match_id=_match_id order by game_number limit 1;
    if not found then _res := null; _status := 'agendado';
    elsif g.score_a > g.score_b then _res := 'lado_a'; _status := 'finalizado';
    elsif g.score_b > g.score_a then _res := 'lado_b'; _status := 'finalizado';
    elsif st.set_draw_enabled then _res := 'empate'; _status := 'finalizado';
    else _res := null; _status := 'em_andamento';
    end if;
  else
    _P := st.points_per_set;
    _need := (st.sets_to_play / 2) + 1;
    for g in select * from public.match_games where match_id=_match_id order by game_number loop
      _gc := _gc + 1;
      if    g.score_a >= _P and g.score_a - g.score_b >= 2 then _sa := _sa + 1;
      elsif g.score_b >= _P and g.score_b - g.score_a >= 2 then _sb := _sb + 1;
      elsif st.set_draw_enabled and g.score_a = g.score_b and g.score_a >= _P then _sd := _sd + 1;
      end if;
    end loop;

    if _sa >= _need then _res := 'lado_a'; _status := 'finalizado';
    elsif _sb >= _need then _res := 'lado_b'; _status := 'finalizado';
    elsif _gc >= st.sets_to_play and (_sa + _sb + _sd) = st.sets_to_play then
      if _sa > _sb then _res := 'lado_a'; _status := 'finalizado';
      elsif _sb > _sa then _res := 'lado_b'; _status := 'finalizado';
      elsif st.set_draw_enabled then _res := 'empate'; _status := 'finalizado';
      else _res := null; _status := 'em_andamento';
      end if;
    elsif _gc = 0 then _res := null; _status := 'agendado';
    else _res := null; _status := 'em_andamento';
    end if;
  end if;

  update public.matches set result = _res, status = _status where id = _match_id;
end; $$;

create or replace function public.trg_match_games_resolve()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.resolve_match(coalesce(new.match_id, old.match_id));
  return null;
end; $$;
drop trigger if exists match_games_resolve on public.match_games;
create trigger match_games_resolve
  after insert or update or delete on public.match_games
  for each row execute function public.trg_match_games_resolve();

-- ===== GERAÇÃO ROUND-ROBIN =====
create or replace function public.generate_liga_matches(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _stage_id uuid; _rounds int; _has_finished boolean;
  _parts uuid[]; _n int; _i int; _j int; _r int; _created int := 0;
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
        insert into public.matches
          (championship_id, stage_id, round, side_a_participant_id, side_b_participant_id, status)
        values (_championship_id, _stage_id, _r, _parts[_i], _parts[_j], 'agendado');
        _created := _created + 1;
      end loop;
    end loop;
  end loop;
  return _created;
end; $$;

-- ===== MUDANÇA DE STATUS: ativa (gera) / volta a rascunho (limpa) =====
create or replace function public.trg_championship_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare _has_finished boolean;
begin
  if new.status='ativo' and old.status is distinct from 'ativo' and new.format='liga' then
    perform public.generate_liga_matches(new.id);
  end if;
  if new.status='rascunho' and old.status='ativo' then
    select exists(select 1 from public.matches where championship_id=new.id and status='finalizado')
      into _has_finished;
    if _has_finished then
      raise exception 'nao e possivel voltar para rascunho: ha jogo realizado';
    end if;
    delete from public.matches where championship_id=new.id;
  end if;
  return new;
end; $$;
drop trigger if exists championship_status on public.championships;
create trigger championship_status
  after update of status on public.championships
  for each row execute function public.trg_championship_status();

-- ===== TRAVA: participantes só editáveis em rascunho =====
create or replace function public.trg_participants_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare _cid uuid; _status text;
begin
  _cid := coalesce(new.championship_id, old.championship_id);
  select status into _status from public.championships where id=_cid;
  if _status is distinct from 'rascunho' then
    raise exception 'lista travada: volte o campeonato para rascunho para editar participantes';
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists participants_guard on public.participants;
create trigger participants_guard
  before insert or update or delete on public.participants
  for each row execute function public.trg_participants_guard();

-- ===== AJUSTE da create_liga_championship: cria em rascunho, ativa no fim (gera uma vez) =====
create or replace function public.create_liga_championship(
  _name text, _points_win int, _points_draw int, _points_loss int,
  _allow_draw boolean, _tiebreakers text[], _stage_counting text,
  _rounds int, _sets_to_play int, _points_per_set int, _win_by_two boolean,
  _set_draw_enabled boolean, _time_minutes int, _player_ids uuid[],
  _status text default 'rascunho'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
  _cid uuid; _sid uuid; _pid uuid; _player uuid; _final text;
begin
  if _uid is null then raise exception 'usuario nao autenticado'; end if;
  _final := coalesce(_status,'rascunho');

  insert into public.championships
    (name, format, unit, points_win, points_draw, points_loss, allow_draw, tiebreakers, status, created_by)
  values
    (_name, 'liga', 'player',
     coalesce(_points_win,3), coalesce(_points_draw,1), coalesce(_points_loss,0),
     coalesce(_allow_draw,false),
     coalesce(_tiebreakers, array['sets_ganhos','pontos_ganhos','pontos_sofridos_asc']),
     'rascunho', _uid)
  returning id into _cid;

  insert into public.championship_stages
    (championship_id, name, ordering, kind, counting, rounds, sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes)
  values
    (_cid, 'Fase única', 0, 'liga',
     coalesce(_stage_counting,'set')::counting_system,
     coalesce(_rounds,1), coalesce(_sets_to_play,3), coalesce(_points_per_set,11),
     coalesce(_win_by_two,true), coalesce(_set_draw_enabled,false), _time_minutes)
  returning id into _sid;

  if _player_ids is not null then
    foreach _player in array _player_ids loop
      insert into public.participants (championship_id, kind, enrollment_source, enrollment_status)
        values (_cid, 'player', 'organizador', 'confirmado') returning id into _pid;
      insert into public.participant_members (participant_id, user_id) values (_pid, _player);
    end loop;
  end if;

  if _final = 'ativo' then
    update public.championships set status='ativo' where id=_cid;
  end if;
  return _cid;
end; $$;
