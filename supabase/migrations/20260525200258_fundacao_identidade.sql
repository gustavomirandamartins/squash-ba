-- ========= EXTENSÕES =========
create extension if not exists pgcrypto;

-- ========= ENUMS =========
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('player','organizer','admin');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'genero') then
    create type genero as enum ('masculino','feminino','outro','nao_informado');
  end if;
end $$;

-- ========= TABELAS =========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  birth_date date,
  gender genero default 'nao_informado',
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  email text
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.organizer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- ========= ÍNDICES (colunas usadas em RLS) =========
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_organizer_requests_user_id on public.organizer_requests(user_id);

-- ========= FUNÇÃO has_role (security definer, evita recursão de RLS) =========
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- ========= FUNÇÃO updated_at =========
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ========= TRIGGER: cria perfil + papel player ao registrar =========
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.profiles_private (user_id, email) values (new.id, new.email) on conflict do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'player') on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========= RLS =========
alter table public.profiles            enable row level security;
alter table public.profiles_private    enable row level security;
alter table public.user_roles          enable row level security;
alter table public.organizer_requests  enable row level security;

-- profiles: leitura pública; escrita só do dono
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- profiles_private: só o dono (admin também)
drop policy if exists "profiles_private_select_own" on public.profiles_private;
create policy "profiles_private_select_own" on public.profiles_private
  for select using ((select auth.uid()) = user_id or public.has_role((select auth.uid()),'admin'));

drop policy if exists "profiles_private_update_own" on public.profiles_private;
create policy "profiles_private_update_own" on public.profiles_private
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- user_roles: dono lê os seus; admin lê todos; escrita só admin
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select" on public.user_roles
  for select using ((select auth.uid()) = user_id or public.has_role((select auth.uid()),'admin'));

drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
  for all using (public.has_role((select auth.uid()),'admin'))
  with check (public.has_role((select auth.uid()),'admin'));

-- organizer_requests: dono cria/lê o seu; admin lê e atualiza (aprova/rejeita)
drop policy if exists "org_req_insert_own" on public.organizer_requests;
create policy "org_req_insert_own" on public.organizer_requests
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "org_req_select" on public.organizer_requests;
create policy "org_req_select" on public.organizer_requests
  for select using ((select auth.uid()) = user_id or public.has_role((select auth.uid()),'admin'));

drop policy if exists "org_req_admin_update" on public.organizer_requests;
create policy "org_req_admin_update" on public.organizer_requests
  for update using (public.has_role((select auth.uid()),'admin'))
  with check (public.has_role((select auth.uid()),'admin'));

-- ========= STORAGE: bucket de avatares (leitura pública, escrita só do dono na pasta {uid}/) =========
insert into storage.buckets (id, name, public)
values ('avatars','avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]
  );
