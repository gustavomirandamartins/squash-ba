-- ============================================================================
-- Tabela de anúncios do Marketplace
-- ============================================================================
-- Gerenciada pelo admin no painel de gestão.
-- Leitura pública (usuários autenticados e anon veem anúncios ativos).
-- ============================================================================

create table if not exists public.ads (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  product_service text        not null,
  phone           text,
  email           text,
  address         text,
  active          boolean     not null default true,
  ordering        int         not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.ads enable row level security;

-- Leitura pública de anúncios ativos
create policy "ads_select_active"
  on public.ads for select
  to anon, authenticated
  using (active = true);

-- Admin gerencia tudo
create policy "ads_admin_all"
  on public.ads for all
  to authenticated
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

create index if not exists ads_ordering_idx on public.ads (ordering asc, created_at asc);
