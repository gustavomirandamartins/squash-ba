-- Mapeia cada imagem do bucket público "sponsors" a um link de destino.
-- Imagens são subidas manualmente no Storage; o link é editável no Painel Admin (/admin).
create table if not exists public.sponsor_banners (
  image_name text primary key,
  link_url   text,
  updated_at timestamptz not null default now()
);

alter table public.sponsor_banners enable row level security;

drop policy if exists sponsor_banners_read on public.sponsor_banners;
create policy sponsor_banners_read
  on public.sponsor_banners for select
  using (true);

drop policy if exists sponsor_banners_write on public.sponsor_banners;
create policy sponsor_banners_write
  on public.sponsor_banners for all
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
