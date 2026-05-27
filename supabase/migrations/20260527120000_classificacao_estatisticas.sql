-- ===== VIEW BASE: estatísticas por participante x campeonato =====
create or replace view public.v_participant_match_stats as
with sides as (
  -- expande cada match em duas linhas (uma p/ lado A, uma p/ lado B)
  select m.championship_id, m.id as match_id, m.result,
         m.side_a_participant_id as participant_id, 'a' as side
    from public.matches m where m.status='finalizado' and m.side_a_participant_id is not null
  union all
  select m.championship_id, m.id, m.result, m.side_b_participant_id, 'b'
    from public.matches m where m.status='finalizado' and m.side_b_participant_id is not null
),
match_outcome as (
  select s.championship_id, s.match_id, s.participant_id,
         case
           when s.result='empate' then 'draw'
           when (s.side='a' and s.result='lado_a') or (s.side='b' and s.result='lado_b') then 'win'
           else 'loss'
         end as outcome,
         s.side
    from sides s
),
game_agg as (
  select s.match_id, s.participant_id, s.championship_id,
         sum(case when s.side='a' then g.score_a else g.score_b end) as pf,
         sum(case when s.side='a' then g.score_b else g.score_a end) as pc,
         -- sets a favor/contra/empatados, considerando regra do set (>=P e diff>=2; empate se habilitado)
         sum( case
                when st.counting='tempo' then 0
                when (case when s.side='a' then g.score_a else g.score_b end) >= st.points_per_set
                 and (case when s.side='a' then g.score_a else g.score_b end)
                   - (case when s.side='a' then g.score_b else g.score_a end) >= 2 then 1 else 0 end ) as sf,
         sum( case
                when st.counting='tempo' then 0
                when (case when s.side='a' then g.score_b else g.score_a end) >= st.points_per_set
                 and (case when s.side='a' then g.score_b else g.score_a end)
                   - (case when s.side='a' then g.score_a else g.score_b end) >= 2 then 1 else 0 end ) as sc,
         sum( case
                when st.counting='tempo' then 0
                when st.set_draw_enabled and g.score_a = g.score_b and g.score_a >= st.points_per_set then 1 else 0 end ) as se
    from sides s
    join public.match_games g on g.match_id = s.match_id
    join public.matches m     on m.id = s.match_id
    join public.championship_stages st on st.id = m.stage_id
   group by s.match_id, s.participant_id, s.championship_id
)
select
  ga.championship_id,
  ga.participant_id,
  ga.match_id,
  mo.outcome,
  ga.pf as pontos_favor,
  ga.pc as pontos_contra,
  ga.sf as sets_ganhos,
  ga.sc as sets_perdidos,
  ga.se as sets_empatados
from game_agg ga
join match_outcome mo using (match_id, participant_id);

-- ===== VIEW: agregada por participante x campeonato =====
create or replace view public.v_participant_championship_stats as
select
  s.championship_id,
  s.participant_id,
  count(*) filter (where s.outcome='win')  as v,
  count(*) filter (where s.outcome='draw') as e,
  count(*) filter (where s.outcome='loss') as d,
  coalesce(sum(s.pontos_favor),0)   as pontos_favor,
  coalesce(sum(s.pontos_contra),0)  as pontos_contra,
  coalesce(sum(s.sets_ganhos),0)    as sets_ganhos,
  coalesce(sum(s.sets_perdidos),0)  as sets_perdidos,
  coalesce(sum(s.sets_empatados),0) as sets_empatados
from public.v_participant_match_stats s
group by s.championship_id, s.participant_id;

-- ===== VIEW: estatísticas vida-toda por usuário (todos os campeonatos) =====
create or replace view public.v_user_lifetime_stats as
select pm.user_id,
       count(*) filter (where s.outcome='win')  as v,
       count(*) filter (where s.outcome='draw') as e,
       count(*) filter (where s.outcome='loss') as d,
       coalesce(sum(s.pontos_favor),0)   as pontos_favor,
       coalesce(sum(s.pontos_contra),0)  as pontos_contra,
       coalesce(sum(s.sets_ganhos),0)    as sets_ganhos,
       coalesce(sum(s.sets_perdidos),0)  as sets_perdidos,
       coalesce(sum(s.sets_empatados),0) as sets_empatados
  from public.v_participant_match_stats s
  join public.participant_members pm on pm.participant_id = s.participant_id
 group by pm.user_id;

-- ===== FUNÇÃO: classificação de um campeonato (com tiebreakers configuráveis) =====
create or replace function public.get_standings(_championship_id uuid)
returns table(
  "position" int,
  participant_id uuid,
  display_name text,
  pontos int,
  v int, e int, d int,
  sets_ganhos int, sets_perdidos int, sets_empatados int,
  pontos_favor int, pontos_contra int, saldo_pontos int
) language plpgsql stable security definer set search_path = public as $$
declare
  _c record; _order text := ''; _code text;
begin
  select * into _c from public.championships where id=_championship_id;
  if not found then return; end if;

  -- monta ORDER BY dinamicamente a partir dos tiebreakers do campeonato
  _order := 'pontos desc';
  foreach _code in array coalesce(_c.tiebreakers, array[]::text[]) loop
    if    _code = 'sets_ganhos'         then _order := _order || ', sets_ganhos desc';
    elsif _code = 'pontos_ganhos'       then _order := _order || ', pontos_favor desc';
    elsif _code = 'pontos_sofridos_asc' then _order := _order || ', pontos_contra asc';
    -- códigos desconhecidos são ignorados de propósito
    end if;
  end loop;
  _order := _order || ', display_name asc';

  return query execute format($q$
    with base as (
      select
        p.id as participant_id,
        coalesce(p.display_name, (
          select string_agg(coalesce(pr.full_name,'?'), ' / ' order by pm.id)
            from public.participant_members pm
            join public.profiles pr on pr.id = pm.user_id
           where pm.participant_id = p.id
        )) as display_name,
        coalesce(s.v,0)::int as v, coalesce(s.e,0)::int as e, coalesce(s.d,0)::int as d,
        coalesce(s.sets_ganhos,0)::int    as sets_ganhos,
        coalesce(s.sets_perdidos,0)::int  as sets_perdidos,
        coalesce(s.sets_empatados,0)::int as sets_empatados,
        coalesce(s.pontos_favor,0)::int   as pontos_favor,
        coalesce(s.pontos_contra,0)::int  as pontos_contra,
        (coalesce(s.v,0)*%s + coalesce(s.e,0)*%s + coalesce(s.d,0)*%s)::int as pontos,
        (coalesce(s.pontos_favor,0) - coalesce(s.pontos_contra,0))::int as saldo_pontos
      from public.participants p
      left join public.v_participant_championship_stats s
             on s.participant_id = p.id
      where p.championship_id = %L
        and p.enrollment_status='confirmado'
    )
    select
      (row_number() over (order by %s))::int as position,
      participant_id, display_name, pontos, v, e, d,
      sets_ganhos, sets_perdidos, sets_empatados,
      pontos_favor, pontos_contra, saldo_pontos
    from base
    order by %s
  $q$, _c.points_win, _c.points_draw, _c.points_loss, _championship_id, _order, _order);
end; $$;

grant execute on function public.get_standings(uuid) to authenticated, anon;
