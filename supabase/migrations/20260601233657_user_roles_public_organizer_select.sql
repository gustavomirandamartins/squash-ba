-- Permite que qualquer usuário autenticado veja roles 'organizer'
-- (necessário para exibir professores na Comunidade, Home e Marketplace).
-- Admins e o próprio usuário já podiam ver tudo pela policy anterior.
drop policy if exists "user_roles_select_organizer_public" on public.user_roles;
create policy "user_roles_select_organizer_public"
  on public.user_roles
  for select
  to authenticated
  using (role = 'organizer');
