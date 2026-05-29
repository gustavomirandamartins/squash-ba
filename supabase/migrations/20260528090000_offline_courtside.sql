-- ===== Adiciona 'revisao' ao enum match_status =====
-- Postgres não permite ALTER TYPE ADD VALUE dentro de transação;
-- usamos uma migration idempotente via DO block.
do $$ begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'match_status'::regtype
      and enumlabel = 'revisao'
  ) then
    alter type match_status add value 'revisao';
  end if;
end $$;

-- ===== Coluna: snapshot do servidor no momento do conflito =====
alter table public.matches
  add column if not exists conflict_server_snapshot jsonb;
-- guarda {score_a, score_b, games:[{game_number,score_a,score_b}]}
-- do servidor no momento da detecção; árbitro usa para comparar

-- ===== Coluna: device_id do último write (para detecção de conflito) =====
alter table public.matches
  add column if not exists last_device_id text;
alter table public.match_games
  add column if not exists last_device_id text;

-- ===== Função: resolver conflito (árbitro escolhe lado) =====
create or replace function public.resolve_match_conflict(
  _match_id uuid,
  _chosen_side text -- 'local' | 'server'
) returns void language plpgsql security definer set search_path = public as $$
declare
  _snapshot jsonb; _game jsonb;
begin
  if not public.can_manage_championship(
    (select championship_id from public.matches where id=_match_id)
  ) then raise exception 'sem permissao'; end if;

  if _chosen_side = 'server' then
    -- restaura snapshot do servidor
    select conflict_server_snapshot into _snapshot
      from public.matches where id=_match_id;
    if _snapshot is null then raise exception 'snapshot nao encontrado'; end if;

    -- reescreve match_games com os dados do servidor
    delete from public.match_games where match_id=_match_id;
    for _game in select * from jsonb_array_elements(_snapshot->'games') loop
      insert into public.match_games (match_id, game_number, score_a, score_b)
        values (_match_id,
                (_game->>'game_number')::int,
                (_game->>'score_a')::int,
                (_game->>'score_b')::int);
    end loop;
  end if;
  -- se 'local': mantém match_games atuais (já estão corretos), só limpa status

  -- limpa estado de conflito e deixa resolve_match recalcular
  update public.matches
    set status = 'em_andamento',
        conflict_server_snapshot = null
    where id=_match_id;
  -- trigger resolve_match dispara via match_games ou chamamos manualmente:
  perform public.resolve_match(_match_id);
end; $$;

-- ===== Função: registrar conflito (chamada pelo cliente ao detectar) =====
create or replace function public.flag_match_conflict(
  _match_id uuid,
  _server_snapshot jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_championship(
    (select championship_id from public.matches where id=_match_id)
  ) then raise exception 'sem permissao'; end if;

  update public.matches
    set status = 'revisao',
        conflict_server_snapshot = _server_snapshot
    where id=_match_id;
end; $$;

grant execute on function public.resolve_match_conflict(uuid, text) to authenticated;
grant execute on function public.flag_match_conflict(uuid, jsonb) to authenticated;

-- ===== RLS: status 'revisao' não bloqueia leitura (policy existente já é SELECT true) =====
-- Nenhuma alteração necessária nas policies existentes.
