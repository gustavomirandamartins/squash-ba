-- ============================================================================
-- Tabela de feedback dos usuários
-- ============================================================================
-- Qualquer usuário autenticado pode enviar. Apenas admin lê e atualiza status.
-- ============================================================================

create table if not exists public.feedback (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references auth.users(id) on delete set null,
  user_name  text,
  message    text        not null
               check (char_length(message) >= 5 and char_length(message) <= 1000),
  type       text        not null default 'geral'
               check (type in ('bug', 'sugestao', 'critica', 'geral')),
  status     text        not null default 'novo'
               check (status in ('novo', 'lido', 'resolvido')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Usuários autenticados podem inserir seu próprio feedback
create policy "feedback_insert"
  on public.feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Apenas admins leem
create policy "feedback_select_admin"
  on public.feedback for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  );

-- Apenas admins atualizam status
create policy "feedback_update_admin"
  on public.feedback for update to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  );

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx     on public.feedback (status);
