-- ===== RPC: finalizar partida manualmente (escolha explícita de resultado) =====
-- Permite ao organizador encerrar uma partida indicando lado_a, lado_b ou empate.
-- O trigger `bracket_advance` (já existente em 20260528060000_eliminatoria.sql)
-- dispara automaticamente ao mudar status → 'finalizado' e propaga avanços no bracket.

create or replace function public.finalize_match_manual(
  _match_id uuid,
  _result    text    -- 'lado_a' | 'lado_b' | 'empate'
) returns void language plpgsql security definer set search_path = public as $$
declare
  _champ_id uuid;
begin
  -- Verifica permissão via função existente
  select championship_id into _champ_id from public.matches where id = _match_id;
  if _champ_id is null then raise exception 'partida nao encontrada'; end if;

  if not public.can_manage_championship(_champ_id) then
    raise exception 'sem permissao: apenas organizador ou admin pode finalizar';
  end if;

  -- Valida resultado
  if _result not in ('lado_a','lado_b','empate') then
    raise exception 'resultado invalido: use lado_a, lado_b ou empate';
  end if;

  -- Atualiza a partida.
  -- O trigger trg_bracket_advance dispara ao status virar 'finalizado' e propaga o bracket.
  -- O trigger match_games_resolve NÃO dispara aqui (só quando match_games muda), mas
  -- como estamos sobrescrevendo explicitamente o resultado isso é intencional.
  update public.matches
     set status                  = 'finalizado',
         result                  = _result::match_result,
         conflict_server_snapshot = null
   where id = _match_id;
end; $$;

grant execute on function public.finalize_match_manual(uuid, text) to authenticated;
