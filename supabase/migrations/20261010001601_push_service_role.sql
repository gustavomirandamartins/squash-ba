-- Push: permissões de tabela da chave de serviço (09/10/2026).
--
-- As Edge Functions de push (notify-push, send-push) leem tabelas com a chave
-- de serviço (service_role), e recebiam "permission denied for table
-- push_subscriptions" — o push não chegava a ninguém.
--
-- Causa: nenhuma migration revogou nada. Os privilégios padrão do projeto
-- (pg_default_acl do papel postgres no schema public) dão ao service_role só
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN nas tabelas novas — sem SELECT, INSERT,
-- UPDATE ou DELETE. A 20260526000000_grants_roles devolveu o acesso a anon e
-- authenticated, mas não ao service_role. (Ignorar o RLS, como o service_role
-- faz, não dispensa o GRANT de tabela.)
--
-- Aqui: só o que as funções usam. anon e authenticated não mudam.
--   • notify-push: lê push_subscriptions; apaga as expiradas.
--   • send-push:   lê profiles, conversation_members, user_blocks (já concedido
--                  em 20261009233238_moderacao) e push_subscriptions; apaga as
--                  expiradas.
--   • delete-account: só a API de administração do Auth (sem tabelas).

grant select, delete on table public.push_subscriptions to service_role;
grant select on table public.conversation_members to service_role;
grant select on table public.profiles to service_role;
