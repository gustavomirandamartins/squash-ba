-- ===== Função auxiliar: organizador ou admin =====
create or replace function public.is_organizer_or_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'organizer') or public.has_role(_user_id,'admin');
$$;

-- ===== CATEGORIES =====
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== VENUES (locais de jogo) =====
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== COURTS (quadras, filhas de venue) =====
create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ===== TEAMS (times) =====
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  has_own_venue boolean not null default false,
  home_venue_id uuid references public.venues(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_home_venue check (has_own_venue = false or home_venue_id is not null)
);

-- ===== VÍNCULOS NO PROFILE =====
alter table public.profiles add column if not exists category_id uuid references public.categories(id) on delete set null;
alter table public.profiles add column if not exists team_id uuid references public.teams(id) on delete set null;

-- ===== ÍNDICES (FKs e joins) =====
create index if not exists idx_courts_venue_id on public.courts(venue_id);
create index if not exists idx_teams_home_venue_id on public.teams(home_venue_id);
create index if not exists idx_profiles_category_id on public.profiles(category_id);
create index if not exists idx_profiles_team_id on public.profiles(team_id);

-- ===== updated_at triggers =====
drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
drop trigger if exists trg_venues_updated_at on public.venues;
create trigger trg_venues_updated_at before update on public.venues
  for each row execute function public.set_updated_at();
drop trigger if exists trg_teams_updated_at on public.teams;
create trigger trg_teams_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

-- ===== RLS =====
alter table public.categories enable row level security;
alter table public.venues     enable row level security;
alter table public.courts     enable row level security;
alter table public.teams      enable row level security;

-- Leitura pública em todas
drop policy if exists "categories_read" on public.categories;
create policy "categories_read" on public.categories for select using (true);
drop policy if exists "venues_read" on public.venues;
create policy "venues_read" on public.venues for select using (true);
drop policy if exists "courts_read" on public.courts;
create policy "courts_read" on public.courts for select using (true);
drop policy if exists "teams_read" on public.teams;
create policy "teams_read" on public.teams for select using (true);

-- Escrita: organizador ou admin
drop policy if exists "categories_write" on public.categories;
create policy "categories_write" on public.categories for all
  using (public.is_organizer_or_admin((select auth.uid())))
  with check (public.is_organizer_or_admin((select auth.uid())));

drop policy if exists "venues_write" on public.venues;
create policy "venues_write" on public.venues for all
  using (public.is_organizer_or_admin((select auth.uid())))
  with check (public.is_organizer_or_admin((select auth.uid())));

drop policy if exists "courts_write" on public.courts;
create policy "courts_write" on public.courts for all
  using (public.is_organizer_or_admin((select auth.uid())))
  with check (public.is_organizer_or_admin((select auth.uid())));

drop policy if exists "teams_write" on public.teams;
create policy "teams_write" on public.teams for all
  using (public.is_organizer_or_admin((select auth.uid())))
  with check (public.is_organizer_or_admin((select auth.uid())));

-- ===== GRANTS =====
grant select on public.categories to anon, authenticated;
grant select on public.venues     to anon, authenticated;
grant select on public.courts     to anon, authenticated;
grant select on public.teams      to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.venues     to authenticated;
grant insert, update, delete on public.courts     to authenticated;
grant insert, update, delete on public.teams      to authenticated;
