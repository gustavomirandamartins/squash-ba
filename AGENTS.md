<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Banco de dados

Migration só entra no banco de produção por `supabase db push`. Nunca por `apply_migration` (MCP), `execute_sql` com escrita ou SQL Editor: eles registram outra versão no histórico (`supabase_migrations.schema_migrations`) e desalinham o repositório do banco.

- Crie o arquivo em `supabase/migrations/<versão>_<nome>.sql` e aplique com `supabase db push` (confira antes com `supabase db push --dry-run`).
- Depois, `supabase migration list --linked` não pode mostrar divergência entre Local e Remote.
- Leituras (`select`) para conferir dados ou o efeito de uma migration podem ser feitas por `execute_sql`.
