-- Desempenho: mensagens não lidas, lista de conversas e nomes nos joins (09/10/2026).
--
-- Antes:
--   • contador da barra: 1 consulta por conversa a cada abertura, volta ao app
--     e mensagem nova;
--   • Home: baixava TODAS as mensagens das conversas do usuário só para contar;
--   • lista de conversas: 1 consulta por conversa para a última mensagem;
--   • nomes de jogadores: rodadas extras (participantes → membros → perfis),
--     porque participant_members.user_id só apontava para auth.users.
--
-- Agora:
--   • get_unread_total(): o total de não lidas, contado no banco;
--   • get_my_conversations(): conversas + última mensagem + não lidas + o outro
--     participante (1:1), numa consulta;
--   • participant_members.user_id também aponta para profiles: o nome e a foto
--     vêm no mesmo join (participant_members(user_id, profiles(full_name, …))).
--
-- As duas funções rodam com as permissões de quem chama (SECURITY INVOKER):
-- o RLS de conversas e mensagens continua valendo.

-- 1. Nome/foto do jogador no mesmo join.
alter table public.participant_members
  drop constraint if exists participant_members_user_profile_fkey;
alter table public.participant_members
  add constraint participant_members_user_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- 2. Última mensagem / não lidas por conversa sem varrer a tabela.
create index if not exists idx_messages_conv_created
  on public.messages (conversation_id, created_at desc);

-- 3. Total de não lidas do usuário logado.
create or replace function public.get_unread_total()
returns integer
language sql stable security invoker set search_path = public
as $$
  select count(*)::int
    from public.conversation_members cm
    join public.messages m on m.conversation_id = cm.conversation_id
   where cm.user_id = (select auth.uid())
     and m.sender_id <> cm.user_id
     and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz);
$$;

-- 4. Conversas do usuário logado, já com o que a lista mostra.
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
   order by lm.created_at desc nulls last;
$$;

revoke execute on function public.get_unread_total() from public, anon;
revoke execute on function public.get_my_conversations() from public, anon;
grant execute on function public.get_unread_total() to authenticated;
grant execute on function public.get_my_conversations() to authenticated;
