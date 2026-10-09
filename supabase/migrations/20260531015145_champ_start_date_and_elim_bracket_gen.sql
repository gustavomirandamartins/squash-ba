-- #1 Data de início do campeonato
alter table public.championships
  add column if not exists start_date date;

-- #4 Correção: ao ativar um campeonato 'eliminatoria', gerar o bracket.
-- O trigger anterior só gerava jogos para liga/desafio; eliminatórias ficavam
-- sem jogos e a tela caía no fallback de classificação triangular.
create or replace function public.trg_championship_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare _has_finished boolean; _generated int;
begin
  if new.status='ativo' and old.status is distinct from 'ativo' then
    if new.format='liga'
       or (new.format='desafio' and new.unit in ('player','pair')) then
      perform public.generate_liga_matches(new.id);
    elsif new.format='desafio' and new.unit='team' then
      select public.generate_team_challenge_matches(new.id) into _generated;
    elsif new.format='eliminatoria' then
      perform public.generate_bracket_matches(new.id);
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
