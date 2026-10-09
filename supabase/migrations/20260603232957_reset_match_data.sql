-- ===== Excluir dados da partida (#5) =====
-- Permite refazer um placar lançado errado (especialmente jogos por tempo):
-- apaga os games, zera o cronômetro (duration_seconds) e volta a partida para
-- 'agendado'. Quem pode gerir o jogo (organizador) OU é participante pode usar.
-- Se o campeonato havia encerrado por causa desta partida, reabre.

create or replace function public.reset_match_data(_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _champ_id uuid;
  _is_participant boolean;
begin
  select championship_id into _champ_id from public.matches where id = _match_id;
  if _champ_id is null then raise exception 'partida nao encontrada'; end if;

  select exists(
    select 1
      from public.matches m
      join public.participant_members pm
        on pm.participant_id in (m.side_a_participant_id, m.side_b_participant_id)
     where m.id = _match_id
       and pm.user_id = (select auth.uid())
  ) into _is_participant;

  if not (public.can_manage_championship(_champ_id) or _is_participant) then
    raise exception 'sem permissao: apenas participantes ou organizador podem limpar a partida';
  end if;

  delete from public.match_games where match_id = _match_id;

  update public.matches
     set status                   = 'agendado',
         result                   = null,
         is_wo                    = false,
         duration_seconds         = null,
         conflict_server_snapshot = null
   where id = _match_id;

  update public.championships set status = 'ativo'
   where id = _champ_id and status = 'encerrado';
end; $$;

grant execute on function public.reset_match_data(uuid) to authenticated;
