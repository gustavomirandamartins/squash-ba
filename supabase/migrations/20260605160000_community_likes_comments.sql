-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Feed da Comunidade — curtidas e comentários                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Curtidas ───────────────────────────────────────────────────────────────
create table if not exists public.community_post_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_community_likes_post on public.community_post_likes(post_id);

alter table public.community_post_likes enable row level security;

drop policy if exists community_likes_select on public.community_post_likes;
create policy community_likes_select on public.community_post_likes
  for select using (true);

drop policy if exists community_likes_insert on public.community_post_likes;
create policy community_likes_insert on public.community_post_likes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists community_likes_delete on public.community_post_likes;
create policy community_likes_delete on public.community_post_likes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ── Comentários ────────────────────────────────────────────────────────────
create table if not exists public.community_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint community_comments_body_len check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists idx_community_comments_post on public.community_post_comments(post_id, created_at);
create index if not exists idx_community_comments_author on public.community_post_comments(author_id);

alter table public.community_post_comments enable row level security;

drop policy if exists community_comments_select on public.community_post_comments;
create policy community_comments_select on public.community_post_comments
  for select using (true);

drop policy if exists community_comments_insert on public.community_post_comments;
create policy community_comments_insert on public.community_post_comments
  for insert to authenticated
  with check ((select auth.uid()) = author_id);

-- Excluir: autor do comentário, dono do post (moderação) ou admin.
drop policy if exists community_comments_delete on public.community_post_comments;
create policy community_comments_delete on public.community_post_comments
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = (select author_id from public.community_posts p where p.id = post_id)
    or public.has_role((select auth.uid()), 'admin')
  );

-- ── RPC do feed (com contagens + se o usuário curtiu) ──────────────────────
-- SECURITY INVOKER (padrão): roda como o chamador; toda leitura já é pública,
-- e auth.uid() resolve o usuário atual para o flag "liked".
create or replace function public.get_community_feed(_limit int default 20, _offset int default 0)
returns table (
  id             uuid,
  author_id      uuid,
  body           text,
  image_path     text,
  embed_url      text,
  embed_provider text,
  created_at     timestamptz,
  author_name    text,
  author_avatar  text,
  like_count     bigint,
  comment_count  bigint,
  liked          boolean
)
language sql
stable
set search_path = public
as $$
  select
    p.id, p.author_id, p.body, p.image_path, p.embed_url, p.embed_provider, p.created_at,
    pr.full_name  as author_name,
    pr.avatar_url as author_avatar,
    (select count(*) from public.community_post_likes    l where l.post_id = p.id) as like_count,
    (select count(*) from public.community_post_comments c where c.post_id = p.id) as comment_count,
    exists (
      select 1 from public.community_post_likes l
      where l.post_id = p.id and l.user_id = (select auth.uid())
    ) as liked
  from public.community_posts p
  join public.profiles pr on pr.id = p.author_id
  order by p.created_at desc
  limit greatest(1, least(_limit, 50))
  offset greatest(0, _offset);
$$;
