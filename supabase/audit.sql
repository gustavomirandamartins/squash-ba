-- QUERY DE AUDITORIA — rode e cole a saída de volta antes de liberar a Fase 2B.
-- Toda linha com rowsecurity = false é um achado (tabela sem RLS = vazamento).
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
