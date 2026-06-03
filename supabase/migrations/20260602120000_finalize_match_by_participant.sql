-- ===== RPC: finalizar partida como participante =====
-- Permite que qualquer membro de um dos lados da partida a encerre,
-- escolhendo o resultado (lado_a, lado_b ou empate).
-- Diferente de finalize_match_manual (organizer/admin), aqui a permissão
-- é verificada pela participação na partida — não pelo papel no campeonato.
-- Uso: "Encerrar partida" pelo próprio jogador quando não for organizer.

create or replace function public.finalize_match_by_participant(
  _match_id uuid,
  _result    text    -- 'lado_a' | 'lado_b' | 'empate'
) returns void language plpgsql security definer set search_path = public as $$
declare
  _is_participant boolean;
begin
  -- Verifica se o usuário autenticado é membro de um dos participantes desta partida
  select exists(
    select 1
      from public.matches m
      join public.participant_members pm
        on pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
     where m.id = _match_id
       and pm.user_id = (select auth.uid())
  ) into _is_participant;

  if not _is_participant then
    raise exception 'sem permissao: apenas participantes da partida podem encerrar';
  end if;

  if _result not in ('lado_a','lado_b','empate') then
    raise exception 'resultado invalido: use lado_a, lado_b ou empate';
  end if;

  -- Atualiza a partida; o trigger trg_bracket_advance propaga avanço no bracket se houver.
  update public.matches
     set status                   = 'finalizado',
         result                   = _result::match_result,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_by_participant(uuid, text) to authenticated;
