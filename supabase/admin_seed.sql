-- SEED DO ADMIN — rodar SEPARADO, APÓS criar seu usuário no Dashboard
-- (Authentication > Users > Add user, com seu e-mail). O magic link/registro
-- dispara handle_new_user(), que já cria profile + papel 'player'.
-- Este script apenas ACRESCENTA o papel 'admin' ao seu usuário.
--
-- Confirme/ajuste o e-mail abaixo antes de rodar:
insert into public.user_roles (user_id, role)
select id, 'admin'::app_role from auth.users where email = 'contato@gustavomartins.com'
on conflict (user_id, role) do nothing;
