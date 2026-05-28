-- ===== has_final no championship =====
alter table public.championships add column if not exists has_final boolean not null default false;

-- ===== Aceitar/recusar convite de desafio =====
create or replace function public.respond_challenge_invite(
  _championship_id uuid,
  _accept boolean
) returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.participants p
    join public.participant_members pm on pm.participant_id = p.id
    where p.championship_id = _championship_id
      and pm.user_id = _uid
      and p.enrollment_status = 'pendente'
  ) then
    raise exception 'convite nao encontrado para este usuario';
  end if;

  if _accept then
    update public.participants p set enrollment_status = 'confirmado'
    from public.participant_members pm
    where pm.participant_id = p.id
      and p.championship_id = _championship_id
      and pm.user_id = _uid
      and p.enrollment_status = 'pendente';
    -- ativa o desafio se ambos confirmados (trigger cuida da geração)
    if (
      select count(*) from public.participants
      where championship_id = _championship_id
        and enrollment_status = 'confirmado'
    ) >= 2 then
      update public.championships set status = 'ativo' where id = _championship_id;
    end if;
  else
    update public.participants p set enrollment_status = 'recusado'
    from public.participant_members pm
    where pm.participant_id = p.id
      and p.championship_id = _championship_id
      and pm.user_id = _uid
      and p.enrollment_status = 'pendente';
    update public.championships set status = 'encerrado' where id = _championship_id;
  end if;
end; $$;

-- ===== Geração bipartida (Desafio por times) =====
create or replace function public.generate_team_challenge_matches(_championship_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _stage_id uuid; _rounds int; _has_finished boolean;
  _team_a uuid; _team_b uuid;
  _parts_a uuid[]; _parts_b uuid[];
  _na int; _nb int; _i int; _j int; _r int; _created int := 0;
begin
  select exists(select 1 from public.matches
    where championship_id=_championship_id and status='finalizado')
  into _has_finished;
  if _has_finished then
    raise exception 'campeonato ja iniciado: nao e possivel regenerar os jogos';
  end if;

  select id, rounds into _stage_id, _rounds
  from public.championship_stages
  where championship_id=_championship_id order by ordering limit 1;
  if _stage_id is null then return 0; end if;

  -- os dois times do desafio (ordenados por ordering)
  select id into _team_a from public.championship_teams
  where championship_id=_championship_id order by ordering limit 1;
  select id into _team_b from public.championship_teams
  where championship_id=_championship_id order by ordering offset 1 limit 1;
  if _team_a is null or _team_b is null then return 0; end if;

  -- participantes de cada time
  select array_agg(p.id order by p.created_at) into _parts_a
  from public.participants p
  where p.championship_id=_championship_id
    and p.championship_team_id=_team_a
    and p.enrollment_status='confirmado';

  select array_agg(p.id order by p.created_at) into _parts_b
  from public.participants p
  where p.championship_id=_championship_id
    and p.championship_team_id=_team_b
    and p.enrollment_status='confirmado';

  _na := coalesce(array_length(_parts_a,1),0);
  _nb := coalesce(array_length(_parts_b,1),0);
  if _na=0 or _nb=0 then return 0; end if;

  delete from public.matches
  where championship_id=_championship_id and bracket_slot is null;

  for _r in 1.._rounds loop
    for _i in 1.._na loop
      for _j in 1.._nb loop
        insert into public.matches
          (championship_id, stage_id, round,
           side_a_participant_id, side_b_participant_id, status)
        values (_championship_id, _stage_id, _r,
                _parts_a[_i], _parts_b[_j], 'agendado');
        _created := _created + 1;
      end loop;
    end loop;
  end loop;
  return _created;
end; $$;

-- ===== Gerar final do Desafio por times =====
create or replace function public.generate_team_challenge_final(_championship_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _stage_id uuid; _uid uuid := (select auth.uid());
  _top_a uuid; _top_b uuid; _match_id uuid;
  _team_a uuid; _team_b uuid;
begin
  if not public.can_manage_championship(_championship_id) then
    raise exception 'sem permissao';
  end if;
  if not (select has_final from public.championships where id=_championship_id) then
    raise exception 'este desafio nao tem final configurada';
  end if;
  if exists (select 1 from public.matches
    where championship_id=_championship_id and bracket_slot=-1) then
    raise exception 'final ja gerada';
  end if;

  select id into _stage_id from public.championship_stages
  where championship_id=_championship_id order by ordering limit 1;

  select id into _team_a from public.championship_teams
  where championship_id=_championship_id order by ordering limit 1;
  select id into _team_b from public.championship_teams
  where championship_id=_championship_id order by ordering offset 1 limit 1;

  -- melhor classificado individual de cada time
  select p.id into _top_a
  from public.participants p
  left join public.v_participant_championship_stats s on s.participant_id=p.id
  where p.championship_id=_championship_id and p.championship_team_id=_team_a
    and p.enrollment_status='confirmado'
  order by coalesce(s.sets_ganhos,0) desc, coalesce(s.pontos_favor,0) desc limit 1;

  select p.id into _top_b
  from public.participants p
  left join public.v_participant_championship_stats s on s.participant_id=p.id
  where p.championship_id=_championship_id and p.championship_team_id=_team_b
    and p.enrollment_status='confirmado'
  order by coalesce(s.sets_ganhos,0) desc, coalesce(s.pontos_favor,0) desc limit 1;

  insert into public.matches
    (championship_id, stage_id, round, bracket_slot,
     side_a_participant_id, side_b_participant_id, status)
  values (_championship_id, _stage_id, 999, -1, _top_a, _top_b, 'agendado')
  returning id into _match_id;
  return _match_id;
end; $$;

-- ===== Classificação por equipe no Desafio por times =====
create or replace view public.v_team_standings as
select
  ct.championship_id,
  ct.id as championship_team_id,
  ct.name as team_name,
  coalesce(sum(s.v),0)::int               as v,
  coalesce(sum(s.e),0)::int               as e,
  coalesce(sum(s.d),0)::int               as d,
  coalesce(sum(s.pontos_favor),0)::int    as pontos_favor,
  coalesce(sum(s.pontos_contra),0)::int   as pontos_contra,
  coalesce(sum(s.sets_ganhos),0)::int     as sets_ganhos,
  coalesce(sum(s.sets_perdidos),0)::int   as sets_perdidos
from public.championship_teams ct
join public.participants p
  on p.championship_id=ct.championship_id
  and p.championship_team_id=ct.id
  and p.enrollment_status='confirmado'
left join public.v_participant_championship_stats s
  on s.participant_id=p.id
where ct.championship_id in (
  select id from public.championships where format='desafio' and unit='team'
)
group by ct.championship_id, ct.id, ct.name;

-- ===== Trigger de ativação para Desafio por times =====
create or replace function public.trg_championship_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare _has_finished boolean; _generated int;
begin
  if new.status='ativo' and old.status is distinct from 'ativo' then
    if new.format='liga' or (new.format='desafio' and new.unit='player') then
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

grant execute on function public.respond_challenge_invite(uuid, boolean) to authenticated;
grant execute on function public.generate_team_challenge_matches(uuid) to authenticated;
grant execute on function public.generate_team_challenge_final(uuid) to authenticated;
