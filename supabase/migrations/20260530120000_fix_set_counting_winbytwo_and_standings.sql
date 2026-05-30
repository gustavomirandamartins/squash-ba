-- ============================================================================
-- Fix: contagem de sets respeitando win_by_two + classificação (nomes/contagem)
-- ============================================================================
-- Bug 1: resolve_match e v_participant_match_stats exigiam SEMPRE diferença de
--        2 pontos para contar um set vencido (`>= 2`), ignorando a flag
--        win_by_two da fase. Quando win_by_two=false, um set 11-10 não era
--        contado → a partida não finalizava sozinha (forçava finalização
--        manual com escolha do vencedor).
-- Bug 2: get_standings não exibia o nome quando display_name era vazio/nulo
--        e os membros não resolviam — agora há fallback robusto.
--
-- Regra de set correta:
--   win_by_two = true  → vence o set quem chega a points_per_set com 2+ de frente
--   win_by_two = false → vence o set quem chega a points_per_set com mais pontos
-- Regra de partida (melhor de N): vence quem alcança floor(N/2)+1 sets; se todos
--   os N sets forem jogados sem maioria, vence quem tiver MAIS sets vencidos.
-- ============================================================================

-- ===== resolve_match: respeita win_by_two =====
create or replace function public.resolve_match(_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record; st record; g record;
  _P int; _need int; _w2 boolean;
  _sa int := 0; _sb int := 0; _sd int := 0; _gc int := 0;
  _res match_result; _status match_status;
begin
  select * into m from public.matches where id = _match_id;
  if not found or m.stage_id is null then return; end if;
  select * into st from public.championship_stages where id = m.stage_id;

  if st.counting = 'tempo' then
    -- Jogo por tempo: só finaliza se o cronômetro foi encerrado
    if m.duration_seconds is null then
      select * into g from public.match_games where match_id=_match_id limit 1;
      if found then _status := 'em_andamento'; else _status := 'agendado'; end if;
      _res := null;
    else
      select * into g from public.match_games where match_id=_match_id order by game_number limit 1;
      if not found then
        _res := null; _status := 'agendado';
      elsif g.score_a > g.score_b then
        _res := 'lado_a'; _status := 'finalizado';
      elsif g.score_b > g.score_a then
        _res := 'lado_b'; _status := 'finalizado';
      elsif st.set_draw_enabled then
        _res := 'empate'; _status := 'finalizado';
      else
        _res := null; _status := 'em_andamento';
      end if;
    end if;

  else
    -- Sets / pontos corridos
    _P    := st.points_per_set;
    _w2   := coalesce(st.win_by_two, true);
    _need := (st.sets_to_play / 2) + 1;

    for g in select * from public.match_games where match_id=_match_id order by game_number loop
      _gc := _gc + 1;
      if _w2 then
        -- vantagem de 2 obrigatória
        if    g.score_a >= _P and g.score_a - g.score_b >= 2 then _sa := _sa + 1;
        elsif g.score_b >= _P and g.score_b - g.score_a >= 2 then _sb := _sb + 1;
        elsif st.set_draw_enabled and g.score_a = g.score_b and g.score_a >= _P then _sd := _sd + 1;
        end if;
      else
        -- sem vantagem de 2: vence o set quem chega a _P com mais pontos
        if    g.score_a >= _P and g.score_a > g.score_b then _sa := _sa + 1;
        elsif g.score_b >= _P and g.score_b > g.score_a then _sb := _sb + 1;
        elsif st.set_draw_enabled and g.score_a = g.score_b and g.score_a >= _P then _sd := _sd + 1;
        end if;
      end if;
    end loop;

    if _sa >= _need then
      _res := 'lado_a'; _status := 'finalizado';
    elsif _sb >= _need then
      _res := 'lado_b'; _status := 'finalizado';
    elsif _gc >= st.sets_to_play and (_sa + _sb + _sd) = st.sets_to_play then
      -- Todos os sets jogados: vence quem tiver mais sets
      if    _sa > _sb then _res := 'lado_a'; _status := 'finalizado';
      elsif _sb > _sa then _res := 'lado_b'; _status := 'finalizado';
      elsif st.set_draw_enabled then _res := 'empate'; _status := 'finalizado';
      else  _res := null; _status := 'em_andamento';
      end if;
    elsif _gc = 0 then
      _res := null; _status := 'agendado';
    else
      _res := null; _status := 'em_andamento';
    end if;
  end if;

  update public.matches set result = _res, status = _status where id = _match_id;
end; $$;

-- ===== v_participant_match_stats: contagem de sets respeita win_by_two =====
create or replace view public.v_participant_match_stats as
with sides as (
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
         -- sets a favor (do lado do participante)
         sum( case
                when st.counting='tempo' then 0
                when coalesce(st.win_by_two,true) then
                  case when (case when s.side='a' then g.score_a else g.score_b end) >= st.points_per_set
                        and (case when s.side='a' then g.score_a else g.score_b end)
                          - (case when s.side='a' then g.score_b else g.score_a end) >= 2
                       then 1 else 0 end
                else
                  case when (case when s.side='a' then g.score_a else g.score_b end) >= st.points_per_set
                        and (case when s.side='a' then g.score_a else g.score_b end)
                          > (case when s.side='a' then g.score_b else g.score_a end)
                       then 1 else 0 end
              end ) as sf,
         -- sets contra
         sum( case
                when st.counting='tempo' then 0
                when coalesce(st.win_by_two,true) then
                  case when (case when s.side='a' then g.score_b else g.score_a end) >= st.points_per_set
                        and (case when s.side='a' then g.score_b else g.score_a end)
                          - (case when s.side='a' then g.score_a else g.score_b end) >= 2
                       then 1 else 0 end
                else
                  case when (case when s.side='a' then g.score_b else g.score_a end) >= st.points_per_set
                        and (case when s.side='a' then g.score_b else g.score_a end)
                          > (case when s.side='a' then g.score_a else g.score_b end)
                       then 1 else 0 end
              end ) as sc,
         -- sets empatados
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

-- ===== get_standings: fallback robusto para o nome do jogador =====
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

  _order := 'pontos desc';
  foreach _code in array coalesce(_c.tiebreakers, array[]::text[]) loop
    if    _code = 'sets_ganhos'         then _order := _order || ', sets_ganhos desc';
    elsif _code = 'pontos_ganhos'       then _order := _order || ', pontos_favor desc';
    elsif _code = 'pontos_sofridos_asc' then _order := _order || ', pontos_contra asc';
    end if;
  end loop;
  _order := _order || ', display_name asc';

  return query execute format($q$
    with base as (
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
