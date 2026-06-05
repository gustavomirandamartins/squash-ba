-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Auditoria — endurecimento de segurança e performance                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Corrige os achados do linter do Supabase (get_advisors):
--   1. [ERRO] security_definer_view — 4 views de estatística rodavam com os
--      privilégios do owner (postgres), ignorando a RLS de quem consulta.
--      Todas leem apenas dados de partida/campeonato, que já são SELECT público
--      (true). Trocar para security_invoker = on faz a view respeitar a RLS do
--      chamador sem mudar o resultado — fecha o vetor de bypass.
--   2. [AVISO] function_search_path_mutable — set_updated_at não fixava o
--      search_path (risco de hijack por objeto homônimo). Como só toca NEW e
--      now(), o search_path vazio é seguro.
--   3. [INFO] unindexed_foreign_keys — adiciona índices de cobertura nas FKs
--      sinalizadas (idempotente; barato nestas tabelas de baixa escrita).

-- ── 1. Views de estatística: respeitar a RLS do chamador ───────────────────
alter view public.v_participant_match_stats         set (security_invoker = on);
alter view public.v_participant_championship_stats   set (security_invoker = on);
alter view public.v_team_standings                   set (security_invoker = on);
alter view public.v_user_lifetime_stats              set (security_invoker = on);

-- ── 2. search_path fixo no trigger de updated_at ───────────────────────────
alter function public.set_updated_at() set search_path = '';

-- ── 3. Índices de cobertura para foreign keys ──────────────────────────────
create index if not exists idx_categories_created_by         on public.categories(created_by);
create index if not exists idx_championship_teams_team_id     on public.championship_teams(team_id);
create index if not exists idx_championships_created_by       on public.championships(created_by);
create index if not exists idx_championships_venue_id         on public.championships(venue_id);
create index if not exists idx_conversations_championship_id  on public.conversations(championship_id);
create index if not exists idx_feedback_user_id              on public.feedback(user_id);
create index if not exists idx_matches_court_id               on public.matches(court_id);
create index if not exists idx_matches_winner_advances_to     on public.matches(winner_advances_to);
create index if not exists idx_messages_sender_id             on public.messages(sender_id);
create index if not exists idx_organizer_requests_reviewed_by on public.organizer_requests(reviewed_by);
create index if not exists idx_teams_created_by               on public.teams(created_by);
create index if not exists idx_user_roles_granted_by          on public.user_roles(granted_by);
create index if not exists idx_venues_created_by              on public.venues(created_by);
