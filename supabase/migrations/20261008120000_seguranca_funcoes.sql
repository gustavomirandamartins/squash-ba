-- Revisão de segurança das funções SECURITY DEFINER (08/10/2026).
--
-- Funções SECURITY DEFINER rodam com os poderes do dono (ignoram RLS). No
-- Postgres, toda função nova nasce executável por PUBLIC — então qualquer
-- pessoa com a chave pública da API (até sem login) podia chamá-las por
-- /rest/v1/rpc/<nome>. Achados:
--
--   • notify(): insere notificação para QUALQUER usuário, com título, texto e
--     link livres — e cada notificação vira um push no celular. Era possível
--     mandar push falso (phishing) para qualquer pessoa, sem login.
--   • generate_*_matches, generate_bracket_from_groups: apagam e refazem os
--     jogos de QUALQUER campeonato sem conferir permissão.
--   • resolve_match, propagate_bracket_advances, create_championship_conversation:
--     recalculam/criam dados de qualquer campeonato sem conferir permissão.
--
-- Correção, por grupo:
--   1. INTERNAS (só chamadas por gatilhos e outras funções do banco, que rodam
--      como o dono): ninguém de fora executa.
--   2. DO APP (chamadas logado): só usuários autenticados. Elas já conferem
--      permissão por dentro; isto tira o acesso sem login.
--   3. FUNÇÕES DE GATILHO: ninguém de fora executa (o Postgres só confere
--      EXECUTE ao criar o gatilho, não quando ele dispara).
--   4. Auxiliares de RLS (can_manage_championship, has_role,
--      is_conversation_member, is_organizer_or_admin) continuam como estão:
--      as políticas de RLS as chamam com o papel de quem consulta.
--   5. Funções criadas daqui em diante não nascem executáveis por anônimos.

do $$
declare
  _fn record;
  internas text[] := array[
    'notify',
    'generate_liga_matches', 'generate_bracket_matches', 'generate_grupos_matches',
    'generate_groups_phase_matches', 'generate_team_challenge_matches',
    'generate_bracket_from_groups', 'propagate_bracket_advances', 'resolve_match',
    'create_championship_conversation'
  ];
  do_app text[] := array[
    'approve_organizer_request', 'reject_organizer_request',
    'grant_organizer_role', 'revoke_organizer_role', 'update_player_category',
    'create_liga_championship', 'create_grupos_elim_championship',
    'finalize_match_manual', 'finalize_match_by_participant',
    'finalize_match_wo', 'finalize_match_wo_by_participant',
    'finalize_match_dq', 'finalize_match_dq_by_participant',
    'finalize_match_double_wo', 'finalize_match_double_wo_by_participant',
    'reopen_match_by_participant', 'reset_match_data',
    'flag_match_conflict', 'resolve_match_conflict', 'swap_bracket_participants',
    'generate_team_challenge_final', 'respond_challenge_invite', 'request_enrollment',
    'get_or_create_direct_conversation',
    'get_standings', 'get_group_standings', 'get_rankings',
    'apply_match_ops', 'import_championship'
  ];
begin
  for _fn in
    select p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (p.proname = any (internas) or p.proname = any (do_app)
            or (p.prosecdef and p.prorettype = 'trigger'::regtype))
  loop
    execute format('revoke execute on function %s from public, anon', _fn.sig);
    if _fn.proname = any (do_app) then
      execute format('grant execute on function %s to authenticated', _fn.sig);
    else
      -- internas e gatilhos: ninguém de fora
      execute format('revoke execute on function %s from authenticated', _fn.sig);
    end if;
    execute format('grant execute on function %s to service_role', _fn.sig);
  end loop;
end $$;

-- search_path fixo (aviso do linter): evita que um objeto com o mesmo nome em
-- outro schema seja usado no lugar do de public.
alter function public.trg_matches_clear_double_wo() set search_path = public;

-- Funções futuras criadas pelo postgres em public: sem execução para anônimos.
-- Quem precisar expor uma RPC concede explicitamente (grant ... to authenticated).
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
