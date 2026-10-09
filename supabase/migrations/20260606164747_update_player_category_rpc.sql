-- RPC para organizer/admin alterar a categoria de qualquer jogador.
-- security definer: executa como owner, bypassa a RLS "profiles_update_own".
create or replace function public.update_player_category(
  _target_user_id uuid,
  _category_id     uuid  -- null remove a categoria
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Apenas organizer ou admin pode usar
  if not exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and role in ('organizer', 'admin')
  ) then
    raise exception 'não autorizado';
  end if;

  update public.profiles
     set category_id = _category_id
   where id = _target_user_id;
end; $$;

grant execute on function public.update_player_category(uuid, uuid) to authenticated;
