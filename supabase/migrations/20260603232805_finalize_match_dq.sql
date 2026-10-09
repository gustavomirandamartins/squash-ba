-- ===== Desclassificação (DQ) =====
-- Diferente do W.O. (não comparecimento, is_wo=true → não conta sets/pontos) e
-- da "interrupção" (mantém o placar parcial e decide por sets), a desclassificação
-- ANULA o placar parcial: o adversário vence, mas o set parcial que ficou em quadra
-- não deve aparecer na tabela de jogos (ex.: "1x0" para quem foi desclassificado).
--
-- A vitória/derrota CONTA normalmente nas estatísticas (is_wo=false), apenas sem
-- sets/pontos de bola — pois os match_games são removidos e a view
-- v_participant_match_stats faz LEFT JOIN em game_agg (coalesce 0).
--
-- Há duas versões, espelhando o par finalize_match_manual / _by_participant:
--   • finalize_match_dq               → organizador/admin (can_manage_championship)
--   • finalize_match_dq_by_participant → qualquer membro de um dos lados da partida

create or replace function public.finalize_match_dq(
  _match_id uuid,
  _winner   text   -- 'lado_a' | 'lado_b'
) returns void language plpgsql security definer set search_path = public as $$
declare
  _champ_id uuid;
begin
  select championship_id into _champ_id from public.matches where id = _match_id;
  if _champ_id is null then raise exception 'partida nao encontrada'; end if;

  if not public.can_manage_championship(_champ_id) then
    raise exception 'sem permissao: apenas organizador ou admin pode desclassificar';
  end if;

  if _winner not in ('lado_a','lado_b') then
    raise exception 'vencedor invalido: use lado_a ou lado_b';
  end if;

  -- Anula o placar parcial (a partida foi decidida por desclassificação)
  delete from public.match_games where match_id = _match_id;

  -- Conta como vitória/derrota normal (is_wo=false), sem sets/pontos.
  update public.matches
     set status                   = 'finalizado',
         result                   = _winner::match_result,
         is_wo                    = false,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_dq(uuid, text) to authenticated;

create or replace function public.finalize_match_dq_by_participant(
  _match_id uuid,
  _winner   text   -- 'lado_a' | 'lado_b'
) returns void language plpgsql security definer set search_path = public as $$
declare
  _is_participant boolean;
begin
  select exists(
    select 1
      from public.matches m
      join public.participant_members pm
        on pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
     where m.id = _match_id
       and pm.user_id = (select auth.uid())
  ) into _is_participant;

  if not _is_participant then
    raise exception 'sem permissao: apenas participantes da partida podem desclassificar';
  end if;

  if _winner not in ('lado_a','lado_b') then
    raise exception 'vencedor invalido: use lado_a ou lado_b';
  end if;

  delete from public.match_games where match_id = _match_id;

  update public.matches
     set status                   = 'finalizado',
         result                   = _winner::match_result,
         is_wo                    = false,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_dq_by_participant(uuid, text) to authenticated;
