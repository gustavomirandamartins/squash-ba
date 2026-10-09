-- ════════════════════════════════════════════════════════════════════════
-- Fix: recursão infinita em RLS de conversation_members.
--
-- Problema: a policy cmembers_select fazia subquery na própria
-- conversation_members. Como qualquer acesso à tabela re-dispara a policy,
-- isso gerava recursão infinita → erro 42P17 / HTTP 500 no PostgREST.
-- As policies de conversations e messages também faziam EXISTS sobre
-- conversation_members, herdando indiretamente a mesma recursão.
--
-- Solução: função SECURITY DEFINER (ignora RLS) que checa a participação
-- do usuário numa conversa. Todas as policies passam a usá-la em vez de
-- consultar conversation_members sob RLS.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.is_conversation_member(_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = _conversation_id
      and user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated;

-- conversations: membro lê
drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select
  using (public.is_conversation_member(id));

-- conversation_members: vê a própria linha + membros das suas conversas
drop policy if exists cmembers_select on public.conversation_members;
create policy cmembers_select on public.conversation_members for select
  using (
    user_id = (select auth.uid())
    or public.is_conversation_member(conversation_id)
  );

-- messages: membro lê
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (public.is_conversation_member(conversation_id));

-- messages: membro escreve (sender = self)
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );
