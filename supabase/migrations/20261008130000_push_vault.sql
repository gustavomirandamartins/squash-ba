-- Gatilhos de push sem a chave de serviço exposta (08/10/2026).
--
-- Os webhooks criados pelo painel (notify_push em notifications e
-- on_new_message_push em messages) guardavam a chave de serviço do projeto
-- (a chave mestra, que ignora o RLS) DENTRO da definição do gatilho — visível
-- para quem lê o catálogo do banco (painel, SQL Editor, backups).
--
-- Agora a chave mora no Vault (cofre criptografado do Supabase) e um gatilho
-- próprio a busca na hora de chamar a Edge Function. Mesmo corpo do webhook do
-- painel ({type, table, schema, record, old_record}), mesmas funções de destino.
--
-- A chave é copiada do gatilho atual para o Vault aqui mesmo, em SQL: ela não
-- aparece neste arquivo nem em lugar nenhum. Num banco sem os webhooks (ex.:
-- local), o segredo não é criado e o gatilho apenas não envia push.

-- 1. Chave → Vault (uma vez; antes de trocar os gatilhos).
do $$
declare
  _tok text;
begin
  if exists (select 1 from vault.secrets where name = 'push_webhook_key') then
    return;
  end if;
  select substring(pg_get_triggerdef(t.oid) from 'Bearer ([A-Za-z0-9_\-\.]+)')
    into _tok
    from pg_trigger t
   where not t.tgisinternal and t.tgname in ('notify_push', 'on_new_message_push')
     and pg_get_triggerdef(t.oid) like '%Bearer %'
   limit 1;
  if _tok is null then
    raise notice 'push_webhook_key: nenhum webhook de push com chave encontrado; segredo não criado';
    return;
  end if;
  perform vault.create_secret(
    _tok,
    'push_webhook_key',
    'Chave de serviço usada pelos gatilhos de push (notify-push, send-push)'
  );
end $$;

-- 2. Gatilho de push: lê a chave do Vault e chama a Edge Function (argumento 0).
--    Nunca impede a gravação: sem chave ou com erro de rede, só registra aviso.
create or replace function public.push_webhook()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _key text;
begin
  select decrypted_secret into _key
    from vault.decrypted_secrets
   where name = 'push_webhook_key'
   limit 1;
  if _key is null then
    raise warning 'push_webhook: segredo push_webhook_key ausente no Vault';
    return new;
  end if;

  begin
    perform net.http_post(
      url := tg_argv[0],
      body := jsonb_build_object(
        'type', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', to_jsonb(new),
        'old_record', null
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _key
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'push_webhook: falha ao enfileirar push (%)', sqlerrm;
  end;
  return new;
end $$;

revoke execute on function public.push_webhook() from public, anon, authenticated;

-- 3. Troca os gatilhos do painel pelos novos (mesmos nomes, mesmos destinos).
drop trigger if exists notify_push on public.notifications;
create trigger notify_push
  after insert on public.notifications
  for each row execute function public.push_webhook(
    'https://rghlwuucqkvyzyycewje.supabase.co/functions/v1/notify-push'
  );

drop trigger if exists on_new_message_push on public.messages;
create trigger on_new_message_push
  after insert on public.messages
  for each row execute function public.push_webhook(
    'https://rghlwuucqkvyzyycewje.supabase.co/functions/v1/send-push'
  );
