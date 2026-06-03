-- ============================================================================
-- Fix: participantes podem gravar match_games + RPC reabrir partida
-- ============================================================================
-- Problema raiz do score 0-0 após encerrar:
--   match_games_write usava can_manage_championship, então participantes
--   não conseguiam salvar pontuações via sync engine. O flush antes de
--   finalize_match_by_participant falhava silenciosamente, e a partida
--   era encerrada com os games ainda no IDB local — nunca chegavam ao servidor.
-- ============================================================================

-- 1. Atualiza política de escrita de match_games para permitir participantes
drop policy if exists match_games_write on public.match_games;
create policy match_games_write on public.match_games
  for all
  to authenticated
  using (
    can_manage_championship((
      select m.championship_id from public.matches m where m.id = match_games.match_id
    ))
    or exists (
      select 1
        from public.matches m
        join public.participant_members pm
          on pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
       where m.id = match_games.match_id
         and pm.user_id = (select auth.uid())
    )
  )
  with check (
    can_manage_championship((
      select m.championship_id from public.matches m where m.id = match_games.match_id
    ))
    or exists (
      select 1
        from public.matches m
        join public.participant_members pm
          on pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
       where m.id = match_games.match_id
         and pm.user_id = (select auth.uid())
    )
  );

-- 2. RPC: reabrir partida como participante (sem exigir organizer)
--    Também reabre o campeonato se estava encerrado (z_close_championship
--    fechou automaticamente; reabrindo a partida devemos reabrí-lo também).
create or replace function public.reopen_match_by_participant(_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _champ_id uuid;
begin
  select championship_id into _champ_id from public.matches where id = _match_id;
  if _champ_id is null then raise exception 'partida nao encontrada'; end if;

  if not exists (
    select 1
      from public.matches m
      join public.participant_members pm
        on pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
     where m.id = _match_id
       and pm.user_id = (select auth.uid())
  ) then
    raise exception 'sem permissao: apenas participantes da partida podem reabrir';
  end if;

  update public.matches
     set status = 'em_andamento', result = null, is_wo = false
   where id = _match_id;

  -- Reabre o campeonato se estava encerrado (trigger fechou junto)
  update public.championships
     set status = 'ativo'
   where id = _champ_id and status = 'encerrado';
end; $$;

grant execute on function public.reopen_match_by_participant(uuid) to authenticated;
