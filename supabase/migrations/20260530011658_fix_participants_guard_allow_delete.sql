-- ===== Fix: participants_guard permite DELETE =====
-- O trigger bloqueava CASCADE DELETE quando o campeonato era excluído
-- porque o status não era 'rascunho'. DELETE deve ser sempre permitido:
-- o gate de segurança real é a RLS DELETE policy de championships
-- (can_manage_championship) + a RLS DELETE policy de participants.

create or replace function public.trg_participants_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare _cid uuid; _status text;
begin
  -- DELETE é sempre permitido.
  -- Ocorre em dois cenários:
  --   (a) CASCADE: o campeonato inteiro está sendo excluído — correto.
  --   (b) Remoção explícita de participante pelo organizador — a RLS já garante a permissão.
  if TG_OP = 'DELETE' then
    return old;
  end if;

  -- INSERT e UPDATE: bloqueia se o campeonato não estiver em rascunho.
  _cid := coalesce(new.championship_id, old.championship_id);
  select status into _status from public.championships where id = _cid;
  if _status is distinct from 'rascunho' then
    raise exception 'lista travada: volte o campeonato para rascunho para editar participantes';
  end if;
  return coalesce(new, old);
end; $$;
