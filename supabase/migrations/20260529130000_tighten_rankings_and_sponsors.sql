-- Endurecimento pós-advisor:
-- 1) get_category_rankings não precisa de SECURITY DEFINER (todas as tabelas
--    lidas têm SELECT público) — troca para SECURITY INVOKER e remove EXECUTE de anon.
-- 2) Listagem do bucket sponsors restrita a usuários autenticados (o app só lista
--    logado; URLs públicas de imagem seguem via CDN por ser bucket público).

create or replace function public.get_category_rankings()
returns table (
  category_id uuid,
  category_name text,
  user_id uuid,
  full_name text,
  avatar_url text,
  points integer,
  wins integer,
  played integer,
  set_balance integer,
  rank bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  with stage_max as (
    select m.stage_id, max(m.round) as max_round
    from matches m
    where m.stage_id is not null and m.round is not null
    group by m.stage_id
  ),
  fin as (
    select
      m.id,
      m.result,
      m.side_a_participant_id,
      m.side_b_participant_id,
      coalesce(sg.sets_a, 0) as sets_a,
      coalesce(sg.sets_b, 0) as sets_b,
      case
        when c.format = 'desafio' then 2
        when s.kind = 'eliminatoria' and m.round = sm.max_round then 10
        when s.kind = 'eliminatoria' and sm.max_round >= 2 and m.round = sm.max_round - 1 then 5
        else 3
      end as win_points
    from matches m
    join championships c on c.id = m.championship_id
    left join championship_stages s on s.id = m.stage_id
    left join stage_max sm on sm.stage_id = m.stage_id
    left join lateral (
      select
        count(*) filter (where mg.score_a > mg.score_b) as sets_a,
        count(*) filter (where mg.score_b > mg.score_a) as sets_b
      from match_games mg
      where mg.match_id = m.id
    ) sg on true
    where m.status = 'finalizado' and m.result is not null
  ),
  contrib as (
    select
      pm.user_id,
      case f.result when 'lado_a' then f.win_points when 'empate' then 1 else 0 end as points,
      case when f.result = 'lado_a' then 1 else 0 end as wins,
      1 as played,
      (f.sets_a - f.sets_b) as set_balance
    from fin f
    join participant_members pm on pm.participant_id = f.side_a_participant_id
    where f.side_a_participant_id is not null
    union all
    select
      pm.user_id,
      case f.result when 'lado_b' then f.win_points when 'empate' then 1 else 0 end,
      case when f.result = 'lado_b' then 1 else 0 end,
      1,
      (f.sets_b - f.sets_a)
    from fin f
    join participant_members pm on pm.participant_id = f.side_b_participant_id
    where f.side_b_participant_id is not null
  ),
  agg as (
    select
      contrib.user_id,
      sum(contrib.points)::int as points,
      sum(contrib.wins)::int as wins,
      sum(contrib.played)::int as played,
      sum(contrib.set_balance)::int as set_balance
    from contrib
    group by contrib.user_id
  )
  select
    cat.id as category_id,
    cat.name as category_name,
    p.id as user_id,
    p.full_name,
    p.avatar_url,
    a.points,
    a.wins,
    a.played,
    a.set_balance,
    row_number() over (
      partition by cat.id
      order by a.points desc, a.set_balance desc, a.wins desc
    ) as rank
  from agg a
  join profiles p on p.id = a.user_id
  join categories cat on cat.id = p.category_id
  order by cat.name, rank;
$$;

revoke execute on function public.get_category_rankings() from anon;
grant execute on function public.get_category_rankings() to authenticated;

drop policy if exists "sponsors_public_read" on storage.objects;
create policy "sponsors_authenticated_list"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'sponsors');
