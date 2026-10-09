-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Feed da Comunidade — posts com texto, foto, vídeo (embed) e links          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Qualquer usuário autenticado publica; todos visualizam (leitura pública).
-- Para economizar espaço no plano gratuito:
--   • fotos vão comprimidas para o bucket próprio 'community' (igual ao avatar);
--   • vídeos NÃO são hospedados — guardamos só a URL de embed (YouTube/Instagram).

-- ── Tabela ─────────────────────────────────────────────────────────────────
create table if not exists public.community_posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id) on delete cascade,
  body           text,
  image_path     text,               -- caminho no bucket 'community' (null se não houver foto)
  embed_url      text,               -- URL canônica do vídeo/link (null se não houver)
  embed_provider text check (embed_provider in ('youtube','instagram','link')),
  created_at     timestamptz not null default now(),

  -- Um post precisa de pelo menos um conteúdo.
  constraint community_posts_has_content check (
    coalesce(btrim(body), '') <> '' or image_path is not null or embed_url is not null
  ),
  -- Limite de tamanho do texto.
  constraint community_posts_body_len check (body is null or char_length(body) <= 2000)
);

comment on table public.community_posts is 'Feed da comunidade na home: texto, foto (bucket community) e vídeo/link por embed.';

-- ── Índices ────────────────────────────────────────────────────────────────
create index if not exists idx_community_posts_created_at on public.community_posts(created_at desc);
create index if not exists idx_community_posts_author_id  on public.community_posts(author_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.community_posts enable row level security;

-- Todos (inclusive anon) podem ler o feed.
drop policy if exists community_posts_select on public.community_posts;
create policy community_posts_select on public.community_posts
  for select using (true);

-- Autenticado publica apenas em seu próprio nome.
drop policy if exists community_posts_insert on public.community_posts;
create policy community_posts_insert on public.community_posts
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

-- Autor (ou admin) pode excluir.
drop policy if exists community_posts_delete on public.community_posts;
create policy community_posts_delete on public.community_posts
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or public.has_role((select auth.uid()), 'admin')
  );

-- ── Bucket de fotos do feed ────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('community', 'community', true)
on conflict (id) do update set public = true;

-- Leitura pública.
drop policy if exists "community_public_read" on storage.objects;
create policy "community_public_read" on storage.objects
  for select using (bucket_id = 'community');

-- Escrita/edição/exclusão só na própria pasta (prefixo = uid).
drop policy if exists "community_owner_write" on storage.objects;
create policy "community_owner_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community' and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "community_owner_update" on storage.objects;
create policy "community_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'community' and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "community_owner_delete" on storage.objects;
create policy "community_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community' and (select auth.uid())::text = (storage.foldername(name))[1]
  );
