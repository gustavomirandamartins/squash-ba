-- Permite ao usuário sair/apagar a própria conversa (remove a própria membership).
-- Faltava a policy de DELETE → o .delete() era silenciosamente bloqueado pela RLS,
-- por isso a conversa "reaparecia" ao recarregar.
drop policy if exists cmembers_delete_own on public.conversation_members;
create policy cmembers_delete_own on public.conversation_members
  for delete
  using (user_id = (select auth.uid()));
