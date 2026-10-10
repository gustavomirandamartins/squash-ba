-- Push no app iOS (APNs): aparelhos registrados (10/10/2026).
--
--   • push_devices — um token APNs por aparelho, ligado ao usuário logado.
--     Cada usuário vê só os próprios aparelhos; escrita só pelas RPCs.
--   • register_push_device(_token, _environment) — grava o token ou o
--     reatribui ao usuário logado (o mesmo iPhone pode trocar de conta).
--   • unregister_push_device(_token) — remove o token do usuário logado
--     (ao sair da conta).
--   • service_role (send-push, notify-push): lê os aparelhos, registra o
--     último erro e apaga os tokens que a Apple recusar.

create table if not exists public.push_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique,
  platform    text not null default 'ios' check (platform = 'ios'),
  environment text not null check (environment in ('sandbox', 'production')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  last_error  text
);

create index if not exists idx_push_devices_user on public.push_devices (user_id);

drop trigger if exists trg_push_devices_updated_at on public.push_devices;
create trigger trg_push_devices_updated_at
  before update on public.push_devices
  for each row execute function public.set_updated_at();

alter table public.push_devices enable row level security;

drop policy if exists push_devices_select_own on public.push_devices;
create policy push_devices_select_own on public.push_devices
  for select to authenticated using (user_id = (select auth.uid()));

-- Sem políticas de escrita: o app grava só pelas RPCs abaixo.
revoke all on table public.push_devices from anon, authenticated;
grant select on table public.push_devices to authenticated;
grant select, update, delete on table public.push_devices to service_role;

-- Token APNs: hexadecimal (64 caracteres hoje; aceita até 200), guardado em
-- minúsculas.
create or replace function public.register_push_device(_token text, _environment text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _uid   uuid := (select auth.uid());
  _tok   text := lower(btrim(coalesce(_token, '')));
  _id    uuid;
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;
  if _tok !~ '^[0-9a-f]{64,200}$' then raise exception 'Token de aparelho inválido.'; end if;
  if _environment is null or _environment not in ('sandbox', 'production') then
    raise exception 'Ambiente inválido: %', _environment;
  end if;

  insert into public.push_devices (user_id, token, platform, environment)
  values (_uid, _tok, 'ios', _environment)
  on conflict (token) do update
     set user_id = excluded.user_id,
         environment = excluded.environment,
         last_error = null
  returning id into _id;

  return _id;
end; $$;

-- Remove só se o token for do usuário logado. Devolve se removeu algo.
create or replace function public.unregister_push_device(_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := (select auth.uid());
begin
  if _uid is null then raise exception 'Usuário não autenticado.'; end if;
  delete from public.push_devices
   where token = lower(btrim(coalesce(_token, ''))) and user_id = _uid;
  return found;
end; $$;

revoke all on function public.register_push_device(text, text) from public, anon;
revoke all on function public.unregister_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;
