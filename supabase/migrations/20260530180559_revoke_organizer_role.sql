-- Admin remove o papel de professor (organizer) de um usuário.
-- Também limpa a solicitação para que ele possa pedir novamente no futuro.
create or replace function public.revoke_organizer_role(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'apenas admin pode remover professores';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'voce nao pode remover seu proprio papel';
  end if;

  delete from public.user_roles
    where user_id = target_user_id and role = 'organizer';

  delete from public.organizer_requests where user_id = target_user_id;
end; $$;

grant execute on function public.revoke_organizer_role(uuid) to authenticated;
