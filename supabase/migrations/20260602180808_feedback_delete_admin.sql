create policy "feedback_delete_admin"
  on public.feedback for delete to authenticated
  using (exists (
    select 1 from public.user_roles
    where user_roles.user_id = (select auth.uid()) and user_roles.role = 'admin'::app_role
  ));
