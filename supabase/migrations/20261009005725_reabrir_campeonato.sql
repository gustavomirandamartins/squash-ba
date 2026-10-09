-- Campeonato encerrado volta a "ativo" quando ganha um jogo pendente (09/10/2026).
--
-- Problema: o gatilho de status gerava os jogos SEMPRE que o campeonato virava
-- "ativo" — também ao VOLTAR de "encerrado". Como um campeonato encerrado já
-- tem jogos finalizados, o gerador recusava ("campeonato ja iniciado") e a
-- operação inteira falhava. Na prática:
--   • jogador reabrindo a própria partida num campeonato encerrado → erro;
--   • "excluir dados" de uma partida num campeonato encerrado → erro;
--   • organizador reabrindo uma partida → reabria, mas o campeonato ficava
--     "encerrado" com jogo em aberto;
--   • desafio por times com final: os jogos acabam → o desafio encerra → a
--     final é gerada depois e ficava pendente num desafio "encerrado".
--
-- Correção:
--   1. Os jogos só são gerados na PRIMEIRA ativação (rascunho → ativo).
--   2. Quando um jogo de um campeonato encerrado volta a ficar pendente (reaberto,
--      limpo) ou um jogo novo pendente é criado (a final), o campeonato volta a
--      "ativo". Ele encerra de novo sozinho quando esse jogo termina.

-- 1. Geração de jogos só ao sair do rascunho.
create or replace function public.trg_championship_status()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare _has_finished boolean; _generated int;
begin
  -- Só a primeira ativação gera os jogos. Voltar de "encerrado" (jogo reaberto,
  -- final criada depois) não pode regerar nada.
  if new.status = 'ativo' and old.status = 'rascunho' then
    if new.format='liga'
       or (new.format='desafio' and new.unit in ('player','pair')) then
      perform public.generate_liga_matches(new.id);
    elsif new.format='desafio' and new.unit='team' then
      select public.generate_team_challenge_matches(new.id) into _generated;
    elsif new.format='eliminatoria' then
      perform public.generate_bracket_matches(new.id);
    elsif new.format='grupos_elim' then
      perform public.generate_grupos_matches(new.id);
    end if;
  end if;
  if new.status='rascunho' and old.status='ativo' then
    select exists(select 1 from public.matches
      where championship_id=new.id and status='finalizado')
    into _has_finished;
    if _has_finished then
      raise exception 'nao e possivel voltar para rascunho: ha jogo realizado';
    end if;
    delete from public.matches where championship_id=new.id;
  end if;
  return new;
end; $function$;

-- 2. Status do campeonato acompanha os jogos: encerra quando o último termina
--    (como antes) e reabre quando um jogo volta a ficar pendente ou nasce
--    pendente num campeonato encerrado.
create or replace function public.trg_match_close_championship()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  -- Jogo pendente (novo, reaberto ou limpo) num campeonato encerrado → reabre.
  if new.status in ('agendado', 'em_andamento', 'revisao')
     and (tg_op = 'INSERT' or old.status = 'finalizado') then
    update public.championships
       set status = 'ativo'
     where id = new.championship_id
       and status = 'encerrado';
  end if;

  -- Último jogo terminou → encerra. Só em UPDATE: na geração dos jogos, os
  -- "byes" nascem finalizados antes dos demais existirem.
  if tg_op = 'UPDATE' and new.status = 'finalizado' and old.status is distinct from 'finalizado' then
    if not exists (
      select 1 from public.matches
       where championship_id = new.championship_id
         and status in ('agendado', 'em_andamento')
    ) then
      update public.championships
         set status = 'encerrado'
       where id = new.championship_id
         and status = 'ativo';
    end if;
  end if;
  return new;
end; $function$;

-- Nome com 'z' mantém a ordem: dispara depois do avanço de chave.
drop trigger if exists z_close_championship on public.matches;
create trigger z_close_championship
  after insert or update of status on public.matches
  for each row execute function public.trg_match_close_championship();

-- Funções de gatilho não são chamáveis de fora (como na revisão de segurança).
revoke execute on function public.trg_championship_status() from public, anon, authenticated;
revoke execute on function public.trg_match_close_championship() from public, anon, authenticated;
