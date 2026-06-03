-- ============================================================================
-- #15: Central de notificações (in-app) + gatilhos por evento.
-- ============================================================================
-- Tabela `notifications` (uma linha por destinatário). A UI assina via Realtime
-- e mostra o sininho com badge. O push em segundo plano (app fechado) é enviado
-- pela Edge Function notify-push (webhook em notifications INSERT) — exceto para
-- mensagens, que já têm push próprio (send-push).
--
-- Eventos cobertos:
--   • mensagem recebida            (type='mensagem')
--   • convite para desafio         (type='desafio_convite')
--   • desafio aceito               (type='desafio_aceito')
--   • inscrição em novo campeonato (type='campeonato')
--   • feedback novo        → admins (type='feedback')
--   • solicitação professor → admins (type='professor')
-- ============================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  url         text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, read, created_at desc);

alter table public.notifications enable row level security;

-- O usuário só vê e atualiza (marcar lida) as próprias notificações.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using ((select auth.uid()) = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using ((select auth.uid()) = user_id);

-- Sem policy de INSERT: linhas só nascem via gatilhos security definer.

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- Helper interno
create or replace function public.notify(
  _user_id uuid, _type text, _title text, _body text, _url text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if _user_id is null then return; end if;
  insert into public.notifications (user_id, type, title, body, url)
    values (_user_id, _type, _title, _body, _url);
end; $$;

-- ── Mensagem recebida ───────────────────────────────────────────────────────
create or replace function public.trg_notify_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare _sender text; _m record;
begin
  select coalesce(nullif(btrim(full_name),''),'Alguém') into _sender
    from public.profiles where id = new.sender_id;
  for _m in
    select user_id from public.conversation_members
     where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform public.notify(_m.user_id, 'mensagem', coalesce(_sender,'Nova mensagem'),
                           left(coalesce(new.body,''), 90),
                           '/mensagens/' || new.conversation_id::text);
  end loop;
  return new;
end; $$;
drop trigger if exists notify_message on public.messages;
create trigger notify_message after insert on public.messages
  for each row execute function public.trg_notify_message();

-- ── Convite para desafio / inscrição em campeonato ──────────────────────────
create or replace function public.trg_notify_enrollment()
returns trigger language plpgsql security definer set search_path = public as $$
declare _c record; _p record;
begin
  select championship_id, enrollment_status into _p
    from public.participants where id = new.participant_id;
  if _p.championship_id is null then return new; end if;
  select id, name, format, created_by into _c
    from public.championships where id = _p.championship_id;

  if _c.format = 'desafio' then
    -- só o convidado (pendente) recebe convite; criador/confirmados não
    if _p.enrollment_status = 'pendente' and new.user_id <> _c.created_by then
      perform public.notify(new.user_id, 'desafio_convite', 'Novo desafio',
                            'Você foi desafiado — toque para responder.',
                            '/desafios/' || _c.id::text);
    end if;
  else
    -- inscrição em campeonato (liga/eliminatória/grupos): notifica o inscrito
    if new.user_id <> _c.created_by then
      perform public.notify(new.user_id, 'campeonato', 'Novo campeonato',
                            'Você foi inscrito em ' || coalesce(_c.name,'um campeonato') || '.',
                            '/campeonatos/' || _c.id::text);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists notify_enrollment on public.participant_members;
create trigger notify_enrollment after insert on public.participant_members
  for each row execute function public.trg_notify_enrollment();

-- ── Desafio aceito (notifica o criador) ─────────────────────────────────────
create or replace function public.trg_notify_challenge_accept()
returns trigger language plpgsql security definer set search_path = public as $$
declare _c record;
begin
  if old.enrollment_status = 'pendente' and new.enrollment_status = 'confirmado' then
    select id, name, format, created_by into _c
      from public.championships where id = new.championship_id;
    if _c.format = 'desafio' and _c.created_by is not null then
      perform public.notify(_c.created_by, 'desafio_aceito', 'Desafio aceito',
                            'Seu desafio foi aceito. Bom jogo!',
                            '/desafios/' || _c.id::text);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists notify_challenge_accept on public.participants;
create trigger notify_challenge_accept after update of enrollment_status on public.participants
  for each row execute function public.trg_notify_challenge_accept();

-- ── Feedback novo → todos os admins ─────────────────────────────────────────
create or replace function public.trg_notify_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
declare _a record;
begin
  for _a in select user_id from public.user_roles where role = 'admin' loop
    perform public.notify(_a.user_id, 'feedback', 'Novo feedback',
                          'Um usuário enviou um feedback.', '/admin/feedbacks');
  end loop;
  return new;
end; $$;
drop trigger if exists notify_feedback on public.feedback;
create trigger notify_feedback after insert on public.feedback
  for each row execute function public.trg_notify_feedback();

-- ── Solicitação de professor → todos os admins ──────────────────────────────
create or replace function public.trg_notify_organizer_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare _a record; _name text;
begin
  select coalesce(nullif(btrim(full_name),''),'Um jogador') into _name
    from public.profiles where id = new.user_id;
  for _a in select user_id from public.user_roles where role = 'admin' loop
    perform public.notify(_a.user_id, 'professor', 'Solicitação de professor',
                          coalesce(_name,'Um jogador') || ' quer ser professor.',
                          '/admin/professores');
  end loop;
  return new;
end; $$;
drop trigger if exists notify_organizer_request on public.organizer_requests;
create trigger notify_organizer_request after insert on public.organizer_requests
  for each row execute function public.trg_notify_organizer_request();

grant execute on function public.notify(uuid, text, text, text, text) to authenticated;
