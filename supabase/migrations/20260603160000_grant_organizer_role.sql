-- #6: Admin concede o papel de professor (organizer) a um jogador DIRETAMENTE,
-- sem que ele tenha aberto uma solicitação. Se houver uma solicitação pendente,
-- ela é marcada como aprovada (mantém histórico e some da fila de Professores).

create or replace function public.grant_organizer_role(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'apenas admin pode conceder professores';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
    values (target_user_id, 'organizer', (select auth.uid()))
    on conflict (user_id, role) do nothing;

  update public.organizer_requests
    set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
    where user_id = target_user_id and status = 'pending';
end; $$;

grant execute on function public.grant_organizer_role(uuid) to authenticated;
