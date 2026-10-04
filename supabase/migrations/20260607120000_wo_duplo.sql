-- ===== W.O. DUPLO =====
-- Os dois lados faltaram: a partida é encerrada sem vencedor e NÃO gera
-- pontos, vitória/derrota, sets nem pontos de bola para nenhum dos lados.
--
-- Modelagem: status='finalizado', result=NULL, is_wo=true, is_double_wo=true.
--   • result NULL já é ignorado por get_category_rankings / ranking v2
--     (todos filtram "result is not null").
--   • v_participant_match_stats passa a ignorar partidas de W.O. duplo, então
--     elas não entram em V/E/D, sets, pontos de bola nem em "partidas".
--   • finalizado conta p/ o auto-encerramento do campeonato (trg z_close_championship).
--
-- Mata-mata (bracket_slot <> 0 / not null) NÃO aceita W.O. duplo: alguém precisa
-- avançar na chave. Em liga/grupos/desafio (bracket_slot null) é permitido.

alter table public.matches
  add column if not exists is_double_wo boolean not null default false;

-- Reabrir/limpar a partida zera is_wo; garante que is_double_wo acompanhe.
create or replace function public.trg_matches_clear_double_wo()
returns trigger language plpgsql as $$
begin
  if new.is_wo = false and new.is_double_wo = true then
    new.is_double_wo := false;
  end if;
  return new;
end; $$;

drop trigger if exists matches_clear_double_wo on public.matches;
create trigger matches_clear_double_wo
  before update on public.matches
  for each row execute function public.trg_matches_clear_double_wo();

-- ===== RPC: organizador/admin =====
create or replace function public.finalize_match_double_wo(
  _match_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  _champ_id uuid;
  _slot     int;
begin
  select championship_id, bracket_slot into _champ_id, _slot
    from public.matches where id = _match_id;
  if _champ_id is null then raise exception 'partida nao encontrada'; end if;

  if not public.can_manage_championship(_champ_id) then
    raise exception 'sem permissao: apenas organizador ou admin pode decretar W.O. duplo';
  end if;

  if coalesce(_slot, 0) <> 0 then
    raise exception 'W.O. duplo nao e permitido em partida de mata-mata';
  end if;

  delete from public.match_games where match_id = _match_id;

  update public.matches
     set status                   = 'finalizado',
         result                   = null,
         is_wo                    = true,
         is_double_wo             = true,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_double_wo(uuid) to authenticated;

-- ===== RPC: participante da partida =====
create or replace function public.finalize_match_double_wo_by_participant(
  _match_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  _slot int;
begin
  if not exists (
    select 1
      from public.matches m
      join public.participant_members pm
        on pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
     where m.id = _match_id
       and pm.user_id = (select auth.uid())
  ) then
    raise exception 'sem permissao: apenas participantes da partida podem decretar W.O. duplo';
  end if;

  select bracket_slot into _slot from public.matches where id = _match_id;
  if coalesce(_slot, 0) <> 0 then
    raise exception 'W.O. duplo nao e permitido em partida de mata-mata';
  end if;

  delete from public.match_games where match_id = _match_id;

  update public.matches
     set status                   = 'finalizado',
         result                   = null,
         is_wo                    = true,
         is_double_wo             = true,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_double_wo_by_participant(uuid) to authenticated;

-- ===== v_participant_match_stats: ignora W.O. duplo =====
-- Mesma definição da versão com W.O. (20260602000000_wo_walkover.sql), apenas
-- com "and not m.is_double_wo" nas duas pernas de `sides`.
create or replace view public.v_participant_match_stats as
with sides as (
  select m.championship_id, m.id as match_id, m.result, m.is_wo,
         m.side_a_participant_id as participant_id, 'a' as side
    from public.matches m
   where m.status='finalizado' and not m.is_double_wo and m.side_a_participant_id is not null
  union all
  select m.championship_id, m.id, m.result, m.is_wo, m.side_b_participant_id, 'b'
    from public.matches m
   where m.status='finalizado' and not m.is_double_wo and m.side_b_participant_id is not null
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
         case when s.is_wo then 0 else
           sum(case when s.side='a' then g.score_a else g.score_b end)
         end as pf,
         case when s.is_wo then 0 else
           sum(case when s.side='a' then g.score_b else g.score_a end)
         end as pc,
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
         case when s.is_wo then 0 else
           sum( case
                  when st.counting='tempo' then 0
                  when st.set_draw_enabled and g.score_a = g.score_b and g.score_a >= st.points_per_set then 1 else 0 end )
         end as se
    from sides s
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

-- create or replace preserva as opções da view; reafirma o hardening (audit_hardening).
alter view public.v_participant_match_stats set (security_invoker = on);
