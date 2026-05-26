-- Aprovar: marca pedido como aprovado + concede papel organizer (atômico, só admin)
create or replace function public.approve_organizer_request(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'apenas admin pode aprovar';
  end if;
  update public.organizer_requests
    set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
    where user_id = target_user_id and status = 'pending';
  if not found then
    raise exception 'solicitacao nao encontrada ou ja revisada';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
    values (target_user_id, 'organizer', (select auth.uid()))
    on conflict (user_id, role) do nothing;
end; $$;

-- Rejeitar: marca como rejeitado (atômico, só admin)
create or replace function public.reject_organizer_request(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'apenas admin pode rejeitar';
  end if;
  update public.organizer_requests
    set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
    where user_id = target_user_id and status = 'pending';
  if not found then
    raise exception 'solicitacao nao encontrada ou ja revisada';
  end if;
end; $$;

grant execute on function public.approve_organizer_request(uuid) to authenticated;
grant execute on function public.reject_organizer_request(uuid) to authenticated;

-- AUDITORIA (deve listar as 2 funções com prosecdef = true):
-- select proname, prosecdef from pg_proc
-- where proname in ('approve_organizer_request','reject_organizer_request');
