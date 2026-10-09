-- ============================================================================
-- Campeonatos Oficiais — nova modalidade
-- ============================================================================
-- Oficiais: criados só por admin/professor, visíveis a todos, valem a pontuação
-- especial do ranking (já em get_rankings). Acrescentam descrição, local, datas,
-- inscrição de jogadores ao longo do tempo (organizador adiciona ou jogador
-- solicita e é aprovado) e notificação a todos os usuários (abertura + início).
-- A coluna is_official já existe (migration ranking_v2).
-- ============================================================================

-- ── 1. Colunas novas (nullable; inócuas para campeonatos comuns) ────────────
alter table public.championships
  add column if not exists description text,
  add column if not exists venue_id    uuid references public.venues(id) on delete set null,
  add column if not exists end_date    date;

-- ── 2. RLS de criação — só organizador/admin cria oficiais ──────────────────
drop policy if exists championships_insert on public.championships;
create policy championships_insert on public.championships
  for insert with check (
    (select auth.uid()) = created_by
    and (
      is_official = false
      or public.is_organizer_or_admin((select auth.uid()))
    )
  );

-- ── 3. RPC: jogador solicita inscrição em campeonato oficial ────────────────
-- Cria participant (pendente, origem 'jogador') + participant_member próprio.
-- Idempotente: erro amigável se já inscrito.
create or replace function public.request_enrollment(_championship_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid       uuid := (select auth.uid());
  _champ     record;
  _part_id   uuid;
begin
  if _uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select id, is_official, status, unit into _champ
  from public.championships
  where id = _championship_id;

  if _champ.id is null then
    raise exception 'Campeonato não encontrado.';
  end if;
  if not _champ.is_official then
    raise exception 'Inscrição disponível apenas em campeonatos oficiais.';
  end if;
  if _champ.status <> 'rascunho' then
    raise exception 'As inscrições deste campeonato estão fechadas.';
  end if;
  if _champ.unit <> 'player' then
    raise exception 'Este campeonato não aceita inscrição individual.';
  end if;

  -- Já inscrito (em qualquer status)?
  if exists (
    select 1
    from public.participants p
    join public.participant_members pm on pm.participant_id = p.id
    where p.championship_id = _championship_id and pm.user_id = _uid
  ) then
    raise exception 'Você já está inscrito neste campeonato.';
  end if;

  insert into public.participants
    (championship_id, kind, enrollment_source, enrollment_status)
  values
    (_championship_id, 'player', 'jogador', 'pendente')
  returning id into _part_id;

  insert into public.participant_members (participant_id, user_id)
  values (_part_id, _uid);

  return _part_id;
end;
$$;

grant execute on function public.request_enrollment(uuid) to authenticated;

-- ── 4. Notificação global (abertura de inscrições + início) ─────────────────
-- Insere uma notificação por usuário (cada linha aciona o webhook notify_push).
create or replace function public.trg_notify_official()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _title text;
  _body  text;
begin
  -- Abertura: oficial recém-criado em rascunho (inscrições abertas)
  if (TG_OP = 'INSERT') then
    if new.is_official and new.status = 'rascunho' then
      _title := 'Novo campeonato oficial';
      _body  := new.name || ' — inscrições abertas';
    else
      return new;
    end if;

  -- Início: oficial passou de rascunho para ativo
  elsif (TG_OP = 'UPDATE') then
    if new.is_official and old.status = 'rascunho' and new.status = 'ativo' then
      _title := 'Campeonato oficial iniciado';
      _body  := new.name || ' começou!';
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, url)
  select pr.id, 'campeonato', _title, _body, '/campeonatos/' || new.id::text
  from public.profiles pr;

  return new;
end;
$$;

drop trigger if exists notify_official_insert on public.championships;
create trigger notify_official_insert
  after insert on public.championships
  for each row execute function public.trg_notify_official();

drop trigger if exists notify_official_start on public.championships;
create trigger notify_official_start
  after update of status on public.championships
  for each row execute function public.trg_notify_official();
