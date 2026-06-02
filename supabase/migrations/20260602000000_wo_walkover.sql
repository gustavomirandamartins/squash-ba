-- ===== W.O. (walkover) =====
-- O vencedor leva a vitória (W/L conta nas estatísticas) mas a partida
-- não contribui com sets nem pontos de bola nas estatísticas.
-- Implementação: coluna is_wo + RPC finalize_match_wo + view atualizada.

-- 1. Coluna na tabela de partidas
alter table public.matches
  add column if not exists is_wo boolean not null default false;

-- 2. RPC para decretar W.O.
create or replace function public.finalize_match_wo(
  _match_id uuid,
  _winner   text   -- 'lado_a' | 'lado_b'
) returns void language plpgsql security definer set search_path = public as $$
declare
  _champ_id uuid;
begin
  select championship_id into _champ_id from public.matches where id = _match_id;
  if _champ_id is null then raise exception 'partida nao encontrada'; end if;

  if not public.can_manage_championship(_champ_id) then
    raise exception 'sem permissao: apenas organizador ou admin pode decretar W.O.';
  end if;

  if _winner not in ('lado_a','lado_b') then
    raise exception 'vencedor invalido: use lado_a ou lado_b';
  end if;

  -- Remove qualquer placar parcial (W.O. não tem placar)
  delete from public.match_games where match_id = _match_id;

  -- Finaliza com is_wo=true; o trigger trg_bracket_advance dispara e avança o bracket se necessário.
  update public.matches
     set status = 'finalizado',
         result = _winner::match_result,
         is_wo  = true,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_wo(uuid, text) to authenticated;

-- 3. Atualiza v_participant_match_stats para ignorar sets/pontos de W.O.
--    A vitória/derrota ainda é contada (match_outcome já usa matches.result).
--    Apenas a agregação de sets e pontos de bola é zerada para is_wo=true.
create or replace view public.v_participant_match_stats as
with sides as (
  select m.championship_id, m.id as match_id, m.result, m.is_wo,
         m.side_a_participant_id as participant_id, 'a' as side
    from public.matches m where m.status='finalizado' and m.side_a_participant_id is not null
  union all
  select m.championship_id, m.id, m.result, m.is_wo, m.side_b_participant_id, 'b'
    from public.matches m where m.status='finalizado' and m.side_b_participant_id is not null
),
match_outcome as (
  select s.championship_id, s.match_id, s.participant_id, s.is_wo,
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
         -- W.O.: sets e pontos são 0 independente de match_games
         case when s.is_wo then 0 else
           sum(case when s.side='a' then g.score_a else g.score_b end)
         end as pf,
         case when s.is_wo then 0 else
           sum(case when s.side='a' then g.score_b else g.score_a end)
         end as pc,
         -- sets a favor
         case when s.is_wo then 0 else
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
                end )
         end as sf,
         -- sets contra
         case when s.is_wo then 0 else
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
                end )
         end as sc,
         -- sets empatados
         case when s.is_wo then 0 else
           sum( case
                  when st.counting='tempo' then 0
                  when st.set_draw_enabled and g.score_a = g.score_b and g.score_a >= st.points_per_set then 1 else 0 end )
         end as se
    from sides s
    -- Para W.O., não há match_games — cross join lateral vazio com valores 0
    left join public.match_games g on g.match_id = s.match_id and not s.is_wo
    left join public.matches m     on m.id = s.match_id
    left join public.championship_stages st on st.id = m.stage_id
   group by s.match_id, s.participant_id, s.championship_id, s.is_wo
)
select
  ga.championship_id,
  ga.participant_id,
  ga.match_id,
  mo.outcome,
  coalesce(ga.pf, 0) as pontos_favor,
  coalesce(ga.pc, 0) as pontos_contra,
  coalesce(ga.sf, 0) as sets_ganhos,
  coalesce(ga.sc, 0) as sets_perdidos,
  coalesce(ga.se, 0) as sets_empatados
from match_outcome mo
left join game_agg ga using (match_id, participant_id);
