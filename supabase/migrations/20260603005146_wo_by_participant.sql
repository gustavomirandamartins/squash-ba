-- ===== RPC: decretar W.O. como participante =====
-- Permite que qualquer membro de um dos lados da partida decrete W.O.,
-- indicando que o adversário não compareceu.
-- O vencedor leva a vitória; sets/pontos NÃO contam nas estatísticas (is_wo=true).

create or replace function public.finalize_match_wo_by_participant(
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
    raise exception 'sem permissao: apenas participantes da partida podem decretar W.O.';
  end if;

  if _winner not in ('lado_a','lado_b') then
    raise exception 'vencedor invalido: use lado_a ou lado_b';
  end if;

  delete from public.match_games where match_id = _match_id;

  update public.matches
     set status                   = 'finalizado',
         result                   = _winner::match_result,
         is_wo                    = true,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_wo_by_participant(uuid, text) to authenticated;
