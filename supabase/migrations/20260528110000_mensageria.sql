-- ===== TABELAS =====
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct','group')),
  championship_id uuid references public.championships(id) on delete cascade,
  title text, -- para grupos; null em 1:1
  created_at timestamptz not null default now(),
  constraint chk_group_needs_champ check (kind='direct' or championship_id is not null)
);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz default now(),
  unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ===== ÍNDICES =====
create index if not exists idx_conv_members_user on public.conversation_members(user_id);
create index if not exists idx_conv_members_conv on public.conversation_members(conversation_id);
create index if not exists idx_messages_conv on public.messages(conversation_id);
create index if not exists idx_messages_created on public.messages(created_at);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

-- ===== RLS =====
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;
alter table public.push_subscriptions    enable row level security;

-- conversations: membro lê; qualquer autenticado cria 1:1
drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select
  using (exists (select 1 from public.conversation_members
    where conversation_id=id and user_id=(select auth.uid())));

drop policy if exists conv_insert on public.conversations;
create policy conv_insert on public.conversations for insert
  with check ((select auth.uid()) is not null);

-- conversation_members: membro lê os da sua conversa; insert pelo criador ou organizador/admin
drop policy if exists cmembers_select on public.conversation_members;
create policy cmembers_select on public.conversation_members for select
  using (user_id=(select auth.uid()) or exists (
    select 1 from public.conversation_members cm2
    where cm2.conversation_id=conversation_id and cm2.user_id=(select auth.uid())
  ));

drop policy if exists cmembers_insert on public.conversation_members;
create policy cmembers_insert on public.conversation_members for insert
  with check ((select auth.uid()) is not null);

drop policy if exists cmembers_update_own on public.conversation_members;
create policy cmembers_update_own on public.conversation_members for update
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- messages: membro lê e escreve na conversa
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (exists (select 1 from public.conversation_members
    where conversation_id=messages.conversation_id and user_id=(select auth.uid())));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    sender_id=(select auth.uid()) and
    exists (select 1 from public.conversation_members
      where conversation_id=messages.conversation_id and user_id=(select auth.uid()))
  );

-- push_subscriptions: só o dono
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- ===== FUNÇÃO: criar conversa 1:1 (idempotente) =====
create or replace function public.get_or_create_direct_conversation(_other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
  _cid uuid;
begin
  if _uid is null or _uid = _other_user_id then
    raise exception 'usuario invalido';
  end if;
  select cm1.conversation_id into _cid
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id=cm1.conversation_id
  join public.conversations c on c.id=cm1.conversation_id
  where cm1.user_id=_uid and cm2.user_id=_other_user_id and c.kind='direct'
  limit 1;

  if _cid is not null then return _cid; end if;

  insert into public.conversations (kind) values ('direct') returning id into _cid;
  insert into public.conversation_members (conversation_id, user_id) values (_cid, _uid);
  insert into public.conversation_members (conversation_id, user_id) values (_cid, _other_user_id);
  return _cid;
end; $$;

-- ===== FUNÇÃO: criar grupo de campeonato =====
create or replace function public.create_championship_conversation(_championship_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _cid uuid; _name text; _uid uuid;
begin
  select id into _cid from public.conversations
    where championship_id=_championship_id and kind='group';
  if _cid is not null then return _cid; end if;

  select name into _name from public.championships where id=_championship_id;
  insert into public.conversations (kind, championship_id, title)
    values ('group', _championship_id, _name) returning id into _cid;

  for _uid in
    select distinct pm.user_id
    from public.participants p
    join public.participant_members pm on pm.participant_id=p.id
    where p.championship_id=_championship_id and p.enrollment_status='confirmado'
  loop
    insert into public.conversation_members (conversation_id, user_id)
      values (_cid, _uid) on conflict do nothing;
  end loop;
  return _cid;
end; $$;

-- ===== TRIGGER: cria grupo ao ativar campeonato =====
create or replace function public.trg_championship_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status='ativo' and old.status is distinct from 'ativo' then
    perform public.create_championship_conversation(new.id);
  end if;
  return new;
end; $$;
drop trigger if exists championship_conversation on public.championships;
create trigger championship_conversation
  after update of status on public.championships
  for each row execute function public.trg_championship_conversation();

grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_championship_conversation(uuid) to authenticated;
