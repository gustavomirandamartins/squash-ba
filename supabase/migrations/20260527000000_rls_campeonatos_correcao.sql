-- ===== Função: pode gerenciar este campeonato? =====
create or replace function public.can_manage_championship(_championship_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_organizer_or_admin((select auth.uid()))
      or exists (
        select 1 from public.championships c
        where c.id = _championship_id and c.created_by = (select auth.uid())
      );
$$;

-- ===== Remove as policies de escrita genéricas da 4A (só as 8 do motor) =====
drop policy if exists championships_write        on public.championships;
drop policy if exists championship_stages_write  on public.championship_stages;
drop policy if exists groups_write               on public.groups;
drop policy if exists championship_teams_write   on public.championship_teams;
drop policy if exists participants_write         on public.participants;
drop policy if exists participant_members_write  on public.participant_members;
drop policy if exists matches_write              on public.matches;
drop policy if exists match_games_write          on public.match_games;

-- ===== CHAMPIONSHIPS =====
drop policy if exists championships_insert on public.championships;
create policy championships_insert on public.championships
  for insert with check ((select auth.uid()) = created_by);
drop policy if exists championships_update on public.championships;
create policy championships_update on public.championships
  for update using (public.can_manage_championship(id))
  with check (public.can_manage_championship(id));
drop policy if exists championships_delete on public.championships;
create policy championships_delete on public.championships
  for delete using (public.can_manage_championship(id));

-- ===== STAGES (championship_id direto) =====
drop policy if exists stages_write on public.championship_stages;
create policy stages_write on public.championship_stages
  for all using (public.can_manage_championship(championship_id))
  with check (public.can_manage_championship(championship_id));

-- ===== GROUPS (via stage_id) =====
drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups
  for all using (public.can_manage_championship((select s.championship_id from public.championship_stages s where s.id = stage_id)))
  with check (public.can_manage_championship((select s.championship_id from public.championship_stages s where s.id = stage_id)));

-- ===== CHAMPIONSHIP_TEAMS (championship_id direto) =====
drop policy if exists champ_teams_write on public.championship_teams;
create policy champ_teams_write on public.championship_teams
  for all using (public.can_manage_championship(championship_id))
  with check (public.can_manage_championship(championship_id));

-- ===== PARTICIPANTS (championship_id direto) =====
drop policy if exists participants_write on public.participants;
create policy participants_write on public.participants
  for all using (public.can_manage_championship(championship_id))
  with check (public.can_manage_championship(championship_id));

-- ===== PARTICIPANT_MEMBERS (via participant_id) =====
drop policy if exists pmembers_write on public.participant_members;
create policy pmembers_write on public.participant_members
  for all using (public.can_manage_championship((select p.championship_id from public.participants p where p.id = participant_id)))
  with check (public.can_manage_championship((select p.championship_id from public.participants p where p.id = participant_id)));

-- ===== MATCHES (championship_id direto) =====
drop policy if exists matches_write on public.matches;
create policy matches_write on public.matches
  for all using (public.can_manage_championship(championship_id))
  with check (public.can_manage_championship(championship_id));

-- ===== MATCH_GAMES (via match_id) =====
drop policy if exists match_games_write on public.match_games;
create policy match_games_write on public.match_games
  for all using (public.can_manage_championship((select m.championship_id from public.matches m where m.id = match_id)))
  with check (public.can_manage_championship((select m.championship_id from public.matches m where m.id = match_id)));

-- ===== Função transacional: criar Liga (formato liga, unidade player) =====
create or replace function public.create_liga_championship(
  _name text,
  _points_win int,
  _points_draw int,
  _points_loss int,
  _allow_draw boolean,
  _tiebreakers text[],
  _stage_counting text,        -- 'set' | 'tempo'
  _rounds int,
  _sets_to_play int,
  _points_per_set int,
  _win_by_two boolean,
  _set_draw_enabled boolean,
  _time_minutes int,
  _player_ids uuid[],
  _status text default 'rascunho'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
  _cid uuid; _sid uuid; _pid uuid; _player uuid;
begin
  if _uid is null then raise exception 'usuario nao autenticado'; end if;

  insert into public.championships
    (name, format, unit, points_win, points_draw, points_loss, allow_draw, tiebreakers, status, created_by)
  values
    (_name, 'liga', 'player',
     coalesce(_points_win,3), coalesce(_points_draw,1), coalesce(_points_loss,0),
     coalesce(_allow_draw,false),
     coalesce(_tiebreakers, array['sets_ganhos','pontos_ganhos','pontos_sofridos_asc']),
     coalesce(_status,'rascunho'), _uid)
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
        values (_cid, 'player', 'organizador', 'confirmado')
        returning id into _pid;
      insert into public.participant_members (participant_id, user_id)
        values (_pid, _player);
    end loop;
  end if;

  return _cid;
end; $$;

grant execute on function public.can_manage_championship(uuid) to authenticated;
grant execute on function public.create_liga_championship to authenticated;
