-- ============================================================================
-- Auto-encerramento de campeonato/desafio quando todas as partidas finalizam
-- ============================================================================
-- Problema: não havia mecanismo que transitasse o championship de 'ativo' para
-- 'encerrado' quando o último jogo era finalizado. O trg_bracket_advance só
-- propagava jogadores no bracket; o trg_championship_status só reagia a
-- mudanças no próprio championships. Resultado: campeonatos/desafios ficavam
-- presos em 'ativo' mesmo após todos os jogos encerrados.
--
-- Solução: trigger `close_championship` em public.matches (AFTER UPDATE OF status).
-- Dispara após trg_bracket_advance (ordem alfabética garante isso), então os
-- futuros matches do bracket já foram criados antes da verificação. A condição
-- é simples e vale para todos os formatos:
--   - Nenhuma partida em 'agendado' ou 'em_andamento' restante no campeonato
--   - E ao menos uma partida em 'finalizado' existe (desafio não vazio)
-- ============================================================================

create or replace function public.trg_match_close_championship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Só aciona quando a partida acaba de ser finalizada
  if new.status = 'finalizado' and (old.status is distinct from 'finalizado') then

    -- Verifica se ainda há partidas pendentes neste campeonato
    if not exists (
      select 1 from public.matches
       where championship_id = new.championship_id
         and status in ('agendado', 'em_andamento')
    ) then
      -- Encerra o campeonato (apenas se ainda estiver ativo)
      update public.championships
         set status = 'encerrado'
       where id = new.championship_id
         and status = 'ativo';
    end if;

  end if;
  return new;
end; $$;

-- Nome iniciando por 'z' garante que dispara APÓS bracket_advance (alfabético)
drop trigger if exists z_close_championship on public.matches;
create trigger z_close_championship
  after update of status on public.matches
  for each row execute function public.trg_match_close_championship();
