-- ============================================================================
-- Fix #13: na fase de grupos, a contagem de pontos/partidas deve considerar
-- SOMENTE os jogos da fase de grupos. get_standings agrega TODAS as partidas
-- finalizadas do campeonato — então, ao começar a eliminatória, os resultados
-- do mata-mata inflavam a tabela dos grupos.
--
-- get_group_standings espelha get_standings, mas restringe a agregação aos
-- jogos cujo stage tem kind='grupos'. A ordenação global é consistente com os
-- pontos (a GroupsView filtra por grupo e reordena por position, então a ordem
-- relativa dentro de cada grupo fica correta).
-- ============================================================================

create or replace function public.get_group_standings(_championship_id uuid)
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

  _order := 'pontos desc';
  foreach _code in array coalesce(_c.tiebreakers, array[]::text[]) loop
    if    _code = 'sets_ganhos'         then _order := _order || ', sets_ganhos desc';
    elsif _code = 'pontos_ganhos'       then _order := _order || ', pontos_favor desc';
    elsif _code = 'pontos_sofridos_asc' then _order := _order || ', pontos_contra asc';
    end if;
  end loop;
  _order := _order || ', display_name asc';

  return query execute format($q$
    with stage_stats as (
      select
        vms.participant_id,
        count(*) filter (where vms.outcome='win')  as v,
        count(*) filter (where vms.outcome='draw') as e,
        count(*) filter (where vms.outcome='loss') as d,
        coalesce(sum(vms.pontos_favor),0)   as pontos_favor,
        coalesce(sum(vms.pontos_contra),0)  as pontos_contra,
        coalesce(sum(vms.sets_ganhos),0)    as sets_ganhos,
        coalesce(sum(vms.sets_perdidos),0)  as sets_perdidos,
        coalesce(sum(vms.sets_empatados),0) as sets_empatados
      from public.v_participant_match_stats vms
      join public.matches m              on m.id = vms.match_id
      join public.championship_stages st on st.id = m.stage_id
      where vms.championship_id = %L
        and st.kind = 'grupos'
      group by vms.participant_id
    ),
    base as (
      select
        p.id as participant_id,
        coalesce(
          nullif(btrim(p.display_name), ''),
          nullif((
            select string_agg(coalesce(nullif(btrim(pr.full_name),''), 'Jogador'), ' / ' order by pm.id)
              from public.participant_members pm
              join public.profiles pr on pr.id = pm.user_id
             where pm.participant_id = p.id
          ), ''),
          'Jogador'
        ) as display_name,
        coalesce(s.v,0)::int as v, coalesce(s.e,0)::int as e, coalesce(s.d,0)::int as d,
        coalesce(s.sets_ganhos,0)::int    as sets_ganhos,
        coalesce(s.sets_perdidos,0)::int  as sets_perdidos,
        coalesce(s.sets_empatados,0)::int as sets_empatados,
        coalesce(s.pontos_favor,0)::int   as pontos_favor,
        coalesce(s.pontos_contra,0)::int  as pontos_contra,
        (coalesce(s.v,0)*%s + coalesce(s.e,0)*%s + coalesce(s.d,0)*%s)::int as pontos,
        (coalesce(s.pontos_favor,0) - coalesce(s.pontos_contra,0))::int as saldo_pontos
      from public.participants p
      left join stage_stats s on s.participant_id = p.id
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
  $q$, _championship_id, _c.points_win, _c.points_draw, _c.points_loss, _championship_id, _order, _order);
end; $$;

grant execute on function public.get_group_standings(uuid) to authenticated, anon;
