-- ========= GRANTS DE TABELA =========
-- RLS opera SOBRE os grants: sem GRANT no nível da tabela, o role recebe
-- "permission denied for table ...", independentemente das policies.
-- Aqui liberamos o acesso de tabela; a RLS (já habilitada na fundação)
-- continua sendo a trava de segurança POR LINHA.

grant usage on schema public to anon, authenticated;

-- authenticated: CRUD nas tabelas do app (linhas restringidas por RLS).
--   - profiles / profiles_private: dono escreve o seu (RLS).
--   - user_roles / organizer_requests: escrita sensível é barrada pela RLS
--     (ex.: só admin escreve user_roles), o grant é só o pré-requisito.
grant select, insert, update, delete on public.profiles            to authenticated;
grant select, insert, update, delete on public.profiles_private    to authenticated;
grant select, insert, update, delete on public.user_roles          to authenticated;
grant select, insert, update, delete on public.organizer_requests  to authenticated;

-- anon: somente leitura pública de profiles (perfis são públicos via RLS).
grant select on public.profiles to anon;

-- Tabelas criadas no futuro neste schema herdam os grants automaticamente.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
