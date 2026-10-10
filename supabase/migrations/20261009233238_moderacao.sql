-- Moderação: denúncia, bloqueio e aceite dos termos de uso (09/10/2026).
--
-- Tudo aplicado no banco, para valer igual no web e no app iOS:
--
--   • content_reports — denúncia de post, comentário, mensagem ou perfil.
--     Cada usuário cria e vê as próprias; admin vê e resolve todas. Uma
--     denúncia aberta por usuário e alvo. Denúncia nova notifica os admins.
--     get_content_reports / resolve_content_report: painel do admin.
--
--   • user_blocks — bloqueio entre usuários, nos dois sentidos:
--       – feed e comentários não trazem conteúdo entre eles (RLS de leitura);
--       – a conversa direta some de get_my_conversations, não aceita mensagem
--         nova e não é (re)criada;
--       – em conversa de grupo, mensagens de quem eu bloqueei não aparecem
--         para mim (nem viram notificação);
--       – create_challenge recusa desafio 1v1 entre eles.
--     Campeonatos e ranking não mudam.
--
--   • profiles.terms_accepted_at — aceite dos termos. No cadastro vem do
--     metadado terms_accepted (handle_new_user); quem já tem conta aceita por
--     accept_terms() antes de usar o app.
--
-- Auxiliares de RLS (blocked_with, i_blocked, conversation_blocked) só
-- respondem sobre o próprio usuário logado: não revelam bloqueios de terceiros.

-- ── 1. Termos de uso ─────────────────────────────────────────────────────────

alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- Cadastro: o aceite marcado no formulário chega como metadado do usuário.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, terms_accepted_at)
  values (
    new.id,
    case when coalesce(new.raw_user_meta_data->>'terms_accepted', '') = 'true' then now() end
  )
  on conflict do nothing;
  insert into public.profiles_private (user_id, email) values (new.id, new.email) on conflict do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'player') on conflict do nothing;
  return new;
end; $$;

-- Aceite de quem já tem conta (ou entrou sem passar pelo formulário).
create or replace function public.accept_terms()
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
  _at  timestamptz;
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;
  update public.profiles
     set terms_accepted_at = coalesce(terms_accepted_at, now())
   where id = _uid
  returning terms_accepted_at into _at;
  return _at;
end; $$;

-- ── 2. Bloqueio ──────────────────────────────────────────────────────────────

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocked on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

revoke all on table public.user_blocks from anon;
grant select, insert, delete on table public.user_blocks to authenticated;
-- send-push (chave de serviço) consulta quem bloqueou o remetente.
grant select on table public.user_blocks to service_role;

-- Há bloqueio (em qualquer sentido) entre mim e _other?
create or replace function public.blocked_with(_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select _other is not null and exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = (select auth.uid()) and b.blocked_id = _other)
        or (b.blocker_id = _other and b.blocked_id = (select auth.uid()))
  );
$$;

-- Eu bloqueei _other?
create or replace function public.i_blocked(_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select _other is not null and exists (
    select 1 from public.user_blocks b
     where b.blocker_id = (select auth.uid()) and b.blocked_id = _other
  );
$$;

-- Conversa direta minha com alguém com quem há bloqueio?
create or replace function public.conversation_blocked(_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.conversations c
      join public.conversation_members om
        on om.conversation_id = c.id and om.user_id <> (select auth.uid())
     where c.id = _conversation_id
       and c.kind = 'direct'
       and public.blocked_with(om.user_id)
  );
$$;

-- Há bloqueio entre mim e o autor do post? Lê o post sem o RLS de quem chama
-- (com o RLS, o post de quem está bloqueado nem aparece e a checagem passaria).
create or replace function public.post_blocked(_post_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.blocked_with(p.author_id) from public.community_posts p where p.id = _post_id), false);
$$;

-- Feed e comentários: nada entre usuários bloqueados.
drop policy if exists community_posts_select on public.community_posts;
create policy community_posts_select on public.community_posts
  for select using (not public.blocked_with(author_id));

drop policy if exists community_comments_select on public.community_post_comments;
create policy community_comments_select on public.community_post_comments
  for select using (not public.blocked_with(author_id));

-- Nem comentar nem curtir post de quem está bloqueado.
drop policy if exists community_comments_insert on public.community_post_comments;
create policy community_comments_insert on public.community_post_comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and not public.post_blocked(post_id)
  );

drop policy if exists community_likes_insert on public.community_post_likes;
create policy community_likes_insert on public.community_post_likes
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not public.post_blocked(post_id)
  );

-- Mensagens: não vejo as de quem eu bloqueei; conversa direta bloqueada não
-- aceita mensagem nova.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_conversation_member(conversation_id) and not public.i_blocked(sender_id)
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
    and not public.conversation_blocked(conversation_id)
  );

-- Notificação de mensagem: não avisa quem bloqueou o remetente.
create or replace function public.trg_notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare _sender text; _m record;
begin
  select coalesce(nullif(btrim(full_name),''),'Alguém') into _sender
    from public.profiles where id = new.sender_id;
  for _m in
    select cm.user_id from public.conversation_members cm
     where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id
       and not exists (
         select 1 from public.user_blocks b
          where b.blocker_id = cm.user_id and b.blocked_id = new.sender_id
       )
  loop
    perform public.notify(_m.user_id, 'mensagem', coalesce(_sender,'Nova mensagem'),
                           left(coalesce(new.body,''), 90),
                           '/mensagens/' || new.conversation_id::text);
  end loop;
  return new;
end; $$;

-- Conversa direta com quem está bloqueado não é aberta nem criada.
create or replace function public.get_or_create_direct_conversation(_other_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
  _cid uuid;
begin
  if _uid is null or _uid = _other_user_id then
    raise exception 'usuario invalido';
  end if;
  if public.blocked_with(_other_user_id) then
    raise exception 'Não é possível conversar com este usuário.';
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

-- Total de não lidas: sem conversa direta bloqueada (as mensagens de quem eu
-- bloqueei já saem pelo RLS de messages).
create or replace function public.get_unread_total()
returns integer
language sql stable security invoker set search_path = public
as $$
  select count(*)::int
    from public.conversation_members cm
    join public.messages m on m.conversation_id = cm.conversation_id
   where cm.user_id = (select auth.uid())
     and m.sender_id <> cm.user_id
     and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
     and not public.conversation_blocked(cm.conversation_id);
$$;

-- Lista de conversas: some a direta com quem há bloqueio.
create or replace function public.get_my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  title text,
  championship_id uuid,
  last_read_at timestamptz,
  last_body text,
  last_at timestamptz,
  last_sender_id uuid,
  unread_count integer,
  other_user_id uuid,
  other_name text,
  other_avatar text
)
language sql stable security invoker set search_path = public
as $$
  select c.id, c.kind, c.title, c.championship_id, cm.last_read_at,
         lm.body, lm.created_at, lm.sender_id,
         (select count(*)::int
            from public.messages m
           where m.conversation_id = c.id
             and m.sender_id <> cm.user_id
             and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)),
         o.user_id, p.full_name, p.avatar_url
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    left join lateral (
      select m.body, m.created_at, m.sender_id
        from public.messages m
       where m.conversation_id = c.id
       order by m.created_at desc
       limit 1
    ) lm on true
    left join lateral (
      select om.user_id
        from public.conversation_members om
       where om.conversation_id = c.id and om.user_id <> cm.user_id and c.kind = 'direct'
       limit 1
    ) o on true
    left join public.profiles p on p.id = o.user_id
   where cm.user_id = (select auth.uid())
     and not (c.kind = 'direct' and public.blocked_with(o.user_id))
   order by lm.created_at desc nulls last;
$$;

-- Desafio 1v1 entre bloqueados é recusado (o resto, igual a rpc_criacao).
create or replace function public.create_challenge(_c jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid      uuid := (select auth.uid());
  _id       uuid := nullif(_c->>'id', '')::uuid;
  _owner    uuid;
  _type     text := _c->>'type';
  _stage    jsonb := coalesce(_c->'stage', '{}');
  _allow    boolean;
  _opponent uuid;
  _partner  uuid;
  _opps     uuid[];
  _team_a   jsonb := _c->'team_a';
  _team_b   jsonb := _c->'team_b';
  _a_ids    uuid[];
  _b_ids    uuid[];
  _side     jsonb;
  _ids      uuid[];
  _ct       uuid;
  _u        uuid;
  _ord      int := 0;
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;

  if _id is not null then
    select created_by into _owner from public.championships where id = _id;
    if found then
      if _owner = _uid then return _id; end if;
      raise exception 'id de campeonato ja usado';
    end if;
  else
    _id := gen_random_uuid();
  end if;

  if _type is null or _type not in ('1v1', 'duplas', 'times') then
    raise exception 'tipo de desafio invalido: %', _type;
  end if;
  if coalesce(trim(_c->>'name'), '') = '' then
    raise exception 'Informe o nome do desafio.';
  end if;

  -- Validações (as mesmas das server actions).
  if _type = '1v1' then
    _opponent := nullif(_c->>'opponent_id', '')::uuid;
    if _opponent is null then raise exception 'Selecione um oponente.'; end if;
    if _opponent = _uid then raise exception 'Você não pode desafiar a si mesmo.'; end if;
    if public.blocked_with(_opponent) then
      raise exception 'Não é possível desafiar este jogador.';
    end if;
  elsif _type = 'duplas' then
    _partner := nullif(_c->>'partner_id', '')::uuid;
    select array_agg(u::uuid) into _opps from jsonb_array_elements_text(_c->'opponent_ids') u;
    if _partner is null or coalesce(array_length(_opps, 1), 0) <> 2
       or (select count(distinct x) from unnest(array[_uid, _partner] || _opps) x) <> 4 then
      raise exception 'Selecione 4 jogadores distintos (você, seu parceiro e a dupla adversária).';
    end if;
  else
    select array_agg(u::uuid) into _a_ids from jsonb_array_elements_text(_team_a->'player_ids') u;
    select array_agg(u::uuid) into _b_ids from jsonb_array_elements_text(_team_b->'player_ids') u;
    if (_team_a->>'team_id') = (_team_b->>'team_id') then
      raise exception 'Escolha dois times diferentes.';
    end if;
    if coalesce(array_length(_a_ids, 1), 0) < 1 or coalesce(array_length(_b_ids, 1), 0) < 1 then
      raise exception 'Selecione os jogadores dos dois times.';
    end if;
    if array_length(_a_ids, 1) <> array_length(_b_ids, 1) then
      raise exception 'Os dois times precisam ter a mesma quantidade de jogadores.';
    end if;
    if (select count(distinct x) from unnest(_a_ids || _b_ids) x) <> array_length(_a_ids || _b_ids, 1) then
      raise exception 'Um jogador não pode estar nos dois times.';
    end if;
  end if;

  _allow := coalesce(nullif(_stage->>'counting', ''), 'set') = 'tempo'
            or coalesce((_stage->>'set_draw_enabled')::boolean, false);

  -- 1. Desafio em rascunho.
  insert into public.championships (
    id, name, format, unit, status, allow_draw, has_final,
    points_win, points_draw, points_loss, tiebreakers, created_by, venue_id
  ) values (
    _id,
    trim(_c->>'name'),
    'desafio',
    (case _type when '1v1' then 'player' when 'duplas' then 'pair' else 'team' end)::confront_unit,
    'rascunho',
    _allow,
    _type = 'times' and coalesce((_c->>'has_final')::boolean, false),
    coalesce((_c->>'points_win')::int, 3),
    case when _allow then coalesce((_c->>'points_draw')::int, 1) else 0 end,
    coalesce((_c->>'points_loss')::int, 0),
    coalesce(
      (select array_agg(t) from jsonb_array_elements_text(_c->'tiebreakers') t),
      array['sets_ganhos', 'pontos_ganhos', 'pontos_sofridos_asc']
    ),
    _uid,
    nullif(_c->>'venue_id', '')::uuid
  );

  -- 2. Fase única.
  perform public.insert_championship_stage(_id, 'Fase única', 1, 'liga', _stage, false);

  -- 3. Lados.
  if _type = '1v1' then
    perform public.insert_participant(_id, 'player', 'organizador', 'confirmado', null, null, null, array[_uid]);
    perform public.insert_participant(_id, 'player', 'jogador', 'pendente', null, null, null, array[_opponent]);
    return _id; -- ativa no aceite do convite
  elsif _type = 'duplas' then
    perform public.insert_participant(_id, 'pair', 'organizador', 'confirmado', null, null, null, array[_uid, _partner]);
    perform public.insert_participant(_id, 'pair', 'organizador', 'confirmado', null, null, null, _opps);
  else
    foreach _side in array array[_team_a, _team_b] loop
      insert into public.championship_teams (championship_id, name, team_id, ordering)
      values (_id, _side->>'name', nullif(_side->>'team_id', '')::uuid, _ord)
      returning id into _ct;
      select array_agg(u::uuid) into _ids from jsonb_array_elements_text(_side->'player_ids') u;
      foreach _u in array _ids loop
        perform public.insert_participant(_id, 'player', 'organizador', 'confirmado', null, null, _ct, array[_u]);
      end loop;
      _ord := _ord + 1;
    end loop;
  end if;

  -- 4. Ativa → o gatilho gera os jogos (round-robin ou cruzados entre times).
  update public.championships set status = 'ativo' where id = _id;
  return _id;
end; $$;

-- ── 3. Denúncia ──────────────────────────────────────────────────────────────

create table if not exists public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'message', 'profile')),
  target_id   uuid not null,
  reason      text not null check (reason in ('spam', 'ofensa_ou_assedio', 'conteudo_improprio', 'perfil_falso', 'outro')),
  details     text check (details is null or char_length(details) <= 1000),
  status      text not null default 'aberta' check (status in ('aberta', 'resolvida', 'descartada')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Uma denúncia aberta por usuário e alvo.
create unique index if not exists content_reports_one_open
  on public.content_reports (reporter_id, target_type, target_id)
  where status = 'aberta';
create index if not exists idx_content_reports_status on public.content_reports (status, created_at desc);
create index if not exists idx_content_reports_target on public.content_reports (target_type, target_id);

alter table public.content_reports enable row level security;

drop policy if exists content_reports_select on public.content_reports;
create policy content_reports_select on public.content_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

drop policy if exists content_reports_insert on public.content_reports;
create policy content_reports_insert on public.content_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'aberta' and resolved_by is null and resolved_at is null
  );

drop policy if exists content_reports_update_admin on public.content_reports;
create policy content_reports_update_admin on public.content_reports
  for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

revoke all on table public.content_reports from anon;
grant select, insert, update on table public.content_reports to authenticated;

-- Alvo precisa existir (e mensagem, ser de conversa da qual o denunciante faz
-- parte); ninguém denuncia a si mesmo.
create or replace function public.trg_content_reports_check()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _owner uuid;
begin
  if new.target_type = 'post' then
    select author_id into _owner from public.community_posts where id = new.target_id;
  elsif new.target_type = 'comment' then
    select author_id into _owner from public.community_post_comments where id = new.target_id;
  elsif new.target_type = 'message' then
    select m.sender_id into _owner from public.messages m
     where m.id = new.target_id
       and exists (select 1 from public.conversation_members cm
                    where cm.conversation_id = m.conversation_id and cm.user_id = new.reporter_id);
  else
    select id into _owner from public.profiles where id = new.target_id;
  end if;

  if _owner is null then raise exception 'Conteúdo não encontrado.'; end if;
  if _owner = new.reporter_id then raise exception 'Você não pode denunciar o próprio conteúdo.'; end if;
  return new;
end; $$;

drop trigger if exists content_reports_check on public.content_reports;
create trigger content_reports_check
  before insert on public.content_reports
  for each row execute function public.trg_content_reports_check();

-- Denúncia nova → notificação (e push) para cada admin.
create or replace function public.trg_notify_content_report()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _admin uuid;
  _what  text := case new.target_type
                   when 'post' then 'um post'
                   when 'comment' then 'um comentário'
                   when 'message' then 'uma mensagem'
                   else 'um perfil' end;
begin
  for _admin in select user_id from public.user_roles where role = 'admin' loop
    perform public.notify(_admin, 'denuncia', 'Nova denúncia',
                          'Denunciaram ' || _what || '. Toque para analisar.',
                          '/admin/denuncias');
  end loop;
  return new;
end; $$;

drop trigger if exists notify_content_report on public.content_reports;
create trigger notify_content_report
  after insert on public.content_reports
  for each row execute function public.trg_notify_content_report();

-- Painel do admin: denúncias com o conteúdo e os envolvidos (abertas primeiro).
create or replace function public.get_content_reports(_status text default null)
returns table (
  id               uuid,
  target_type      text,
  target_id        uuid,
  reason           text,
  details          text,
  status           text,
  created_at       timestamptz,
  resolved_at      timestamptz,
  reporter_id      uuid,
  reporter_name    text,
  target_user_id   uuid,
  target_user_name text,
  preview          text,
  target_exists    boolean,
  open_on_target   integer
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'Acesso restrito a administradores.';
  end if;

  return query
  select r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at, r.resolved_at,
         r.reporter_id, rp.full_name,
         t.owner_id, tp.full_name,
         t.preview, t.owner_id is not null,
         (select count(*)::int from public.content_reports o
           where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'aberta')
    from public.content_reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join lateral (
      select x.owner_id, x.preview from (
        select cp.author_id as owner_id,
               coalesce(nullif(btrim(cp.body), ''), case when cp.image_path is not null then '[foto]' else cp.embed_url end) as preview
          from public.community_posts cp where r.target_type = 'post' and cp.id = r.target_id
        union all
        select cc.author_id, cc.body
          from public.community_post_comments cc where r.target_type = 'comment' and cc.id = r.target_id
        union all
        select m.sender_id, m.body
          from public.messages m where r.target_type = 'message' and m.id = r.target_id
        union all
        select pr.id, pr.full_name
          from public.profiles pr where r.target_type = 'profile' and pr.id = r.target_id
      ) x limit 1
    ) t on true
    left join public.profiles tp on tp.id = t.owner_id
   where _status is null or r.status = _status
   order by (r.status = 'aberta') desc, r.created_at desc;
end; $$;

-- Resolve: 'remover' apaga o conteúdo e fecha todas as denúncias abertas do
-- mesmo alvo; 'descartar' fecha só esta. Perfil não é removido por aqui (a
-- exclusão de conta fica na tela de usuários). Devolve o caminho da foto do
-- post removido, para o app apagar o arquivo do Storage.
create or replace function public.resolve_content_report(_report_id uuid, _action text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _uid   uuid := (select auth.uid());
  _r     record;
  _image text;
begin
  if not public.has_role(_uid, 'admin') then
    raise exception 'Acesso restrito a administradores.';
  end if;
  if _action not in ('remover', 'descartar') then
    raise exception 'acao invalida: %', _action;
  end if;

  select * into _r from public.content_reports where id = _report_id for update;
  if not found then raise exception 'Denúncia não encontrada.'; end if;
  if _r.status <> 'aberta' then raise exception 'Esta denúncia já foi analisada.'; end if;

  if _action = 'descartar' then
    update public.content_reports
       set status = 'descartada', resolved_by = _uid, resolved_at = now()
     where id = _report_id;
    return jsonb_build_object('status', 'descartada');
  end if;

  if _r.target_type = 'post' then
    delete from public.community_posts where id = _r.target_id returning image_path into _image;
  elsif _r.target_type = 'comment' then
    delete from public.community_post_comments where id = _r.target_id;
  elsif _r.target_type = 'message' then
    delete from public.messages where id = _r.target_id;
  else
    raise exception 'Perfil não é removido por aqui: use a exclusão de conta na tela de usuários.';
  end if;

  update public.content_reports
     set status = 'resolvida', resolved_by = _uid, resolved_at = now()
   where target_type = _r.target_type and target_id = _r.target_id and status = 'aberta';

  return jsonb_build_object('status', 'resolvida', 'image_path', _image);
end; $$;

-- ── Permissões ───────────────────────────────────────────────────────────────

-- Auxiliares de RLS: as políticas rodam com o papel de quem consulta (inclusive
-- sem login, no feed). Só respondem sobre o próprio usuário.
grant execute on function public.blocked_with(uuid) to anon, authenticated;
grant execute on function public.i_blocked(uuid) to anon, authenticated;
grant execute on function public.conversation_blocked(uuid) to anon, authenticated;
grant execute on function public.post_blocked(uuid) to anon, authenticated;

-- Do app: só autenticados.
revoke all on function public.accept_terms() from public, anon;
revoke all on function public.get_content_reports(text) from public, anon;
revoke all on function public.resolve_content_report(uuid, text) from public, anon;
revoke all on function public.get_or_create_direct_conversation(uuid) from public, anon;
revoke all on function public.create_challenge(jsonb) from public, anon;
grant execute on function public.accept_terms() to authenticated;
grant execute on function public.get_content_reports(text) to authenticated;
grant execute on function public.resolve_content_report(uuid, text) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_challenge(jsonb) to authenticated;
revoke all on function public.get_unread_total() from public, anon;
revoke all on function public.get_my_conversations() from public, anon;
grant execute on function public.get_unread_total() to authenticated;
grant execute on function public.get_my_conversations() to authenticated;

-- De gatilho: ninguém de fora.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.trg_notify_message() from public, anon, authenticated;
revoke all on function public.trg_content_reports_check() from public, anon, authenticated;
revoke all on function public.trg_notify_content_report() from public, anon, authenticated;
