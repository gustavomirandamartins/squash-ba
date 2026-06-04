-- Ranking v2: novo sistema de pontuação
--
-- Pontos por jogo:  vencedor = 2 | perdedor = 1 | empate = 1 cada
-- Bônus campeonato normal (encerrado, não-desafio):
--   1º = 5 | 2º = 3 | 3º = 1
-- Bônus campeonato oficial (encerrado, não-desafio):
--   participação = 5 | 1º = 15 | 2º = 10 | 3º = 5
--
-- Ranking geral (sem filtro) + ranking por categoria via parâmetro.

-- 1. Adiciona coluna is_official em championships
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

-- 2. Remove função antiga
DROP FUNCTION IF EXISTS public.get_category_rankings();

-- 3. Nova função de ranking
CREATE OR REPLACE FUNCTION public.get_rankings(p_category_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id       uuid,
  full_name     text,
  avatar_url    text,
  category_id   uuid,
  category_name text,
  points        integer,
  game_points   integer,
  bonus_points  integer,
  wins          integer,
  losses        integer,
  played        integer,
  set_balance   integer,
  rank          bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH

  -- ── Contribuição de cada partida (vencedor=2, perdedor=1, empate=1 cada) ──
  raw_games AS (
    -- Lado A
    SELECT
      pm.user_id,
      CASE m.result WHEN 'lado_a' THEN 2 WHEN 'empate' THEN 1 ELSE 1 END  AS pts,
      (m.result = 'lado_a')::int                                             AS wins,
      (m.result = 'lado_b')::int                                             AS losses,
      1                                                                       AS played,
      COALESCE(sg.sets_a, 0) - COALESCE(sg.sets_b, 0)                       AS set_bal
    FROM matches m
    JOIN participant_members pm ON pm.participant_id = m.side_a_participant_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE score_a > score_b) AS sets_a,
        COUNT(*) FILTER (WHERE score_b > score_a) AS sets_b
      FROM match_games WHERE match_id = m.id
    ) sg ON true
    WHERE m.status = 'finalizado' AND m.result IS NOT NULL
      AND m.side_a_participant_id IS NOT NULL

    UNION ALL

    -- Lado B
    SELECT
      pm.user_id,
      CASE m.result WHEN 'lado_b' THEN 2 WHEN 'empate' THEN 1 ELSE 1 END,
      (m.result = 'lado_b')::int,
      (m.result = 'lado_a')::int,
      1,
      COALESCE(sg.sets_b, 0) - COALESCE(sg.sets_a, 0)
    FROM matches m
    JOIN participant_members pm ON pm.participant_id = m.side_b_participant_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE score_a > score_b) AS sets_a,
        COUNT(*) FILTER (WHERE score_b > score_a) AS sets_b
      FROM match_games WHERE match_id = m.id
    ) sg ON true
    WHERE m.status = 'finalizado' AND m.result IS NOT NULL
      AND m.side_b_participant_id IS NOT NULL
  ),

  game_agg AS (
    SELECT
      user_id,
      SUM(pts)::int     AS game_points,
      SUM(wins)::int    AS wins,
      SUM(losses)::int  AS losses,
      SUM(played)::int  AS played,
      SUM(set_bal)::int AS set_balance
    FROM raw_games
    GROUP BY user_id
  ),

  -- ── Pódio de campeonatos ──────────────────────────────────────────────────
  -- Eliminatória/Grupos+Elim: final = max round na stage eliminatoria (bracket_slot != -2)
  elim_stage_max AS (
    SELECT m.stage_id, MAX(m.round) AS max_round
    FROM matches m
    JOIN championship_stages s ON s.id = m.stage_id AND s.kind = 'eliminatoria'
    WHERE COALESCE(m.bracket_slot, 0) != -2
    GROUP BY m.stage_id
  ),

  elim_finals AS (
    SELECT
      m.championship_id,
      CASE WHEN m.result = 'lado_a' THEN m.side_a_participant_id
           ELSE                          m.side_b_participant_id END AS champion_part,
      CASE WHEN m.result = 'lado_a' THEN m.side_b_participant_id
           ELSE                          m.side_a_participant_id END AS runner_up_part
    FROM matches m
    JOIN elim_stage_max esm ON esm.stage_id = m.stage_id AND m.round = esm.max_round
    WHERE m.status = 'finalizado' AND m.result IN ('lado_a', 'lado_b')
      AND COALESCE(m.bracket_slot, 0) != -2
  ),

  -- 3º lugar: bracket_slot = -2
  bronze_matches AS (
    SELECT
      m.championship_id,
      CASE WHEN m.result = 'lado_a' THEN m.side_a_participant_id
           ELSE                          m.side_b_participant_id END AS third_part
    FROM matches m
    WHERE m.bracket_slot = -2 AND m.status = 'finalizado'
      AND m.result IN ('lado_a', 'lado_b')
  ),

  -- Liga: classificação por pontos da competição (points_win/draw/loss configurados)
  liga_raw AS (
    SELECT
      m.championship_id,
      m.side_a_participant_id AS participant_id,
      CASE m.result WHEN 'lado_a' THEN c.points_win WHEN 'empate' THEN c.points_draw ELSE c.points_loss END AS pts,
      COALESCE(sg.sets_a, 0) - COALESCE(sg.sets_b, 0) AS set_bal
    FROM matches m
    JOIN championships c ON c.id = m.championship_id AND c.format = 'liga'
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE score_a > score_b) AS sets_a,
             COUNT(*) FILTER (WHERE score_b > score_a) AS sets_b
      FROM match_games WHERE match_id = m.id
    ) sg ON true
    WHERE m.status = 'finalizado' AND m.result IS NOT NULL
      AND m.side_a_participant_id IS NOT NULL

    UNION ALL

    SELECT
      m.championship_id,
      m.side_b_participant_id,
      CASE m.result WHEN 'lado_b' THEN c.points_win WHEN 'empate' THEN c.points_draw ELSE c.points_loss END,
      COALESCE(sg.sets_b, 0) - COALESCE(sg.sets_a, 0)
    FROM matches m
    JOIN championships c ON c.id = m.championship_id AND c.format = 'liga'
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE score_a > score_b) AS sets_a,
             COUNT(*) FILTER (WHERE score_b > score_a) AS sets_b
      FROM match_games WHERE match_id = m.id
    ) sg ON true
    WHERE m.status = 'finalizado' AND m.result IS NOT NULL
      AND m.side_b_participant_id IS NOT NULL
  ),

  liga_standings AS (
    SELECT
      championship_id,
      participant_id,
      ROW_NUMBER() OVER (
        PARTITION BY championship_id
        ORDER BY SUM(pts) DESC, SUM(set_bal) DESC
      ) AS place
    FROM liga_raw
    GROUP BY championship_id, participant_id
  ),

  -- Pódio unificado (nível participant) para todos os campeonatos encerrados não-desafio
  podium_parts AS (
    -- Elim: campeão (1º)
    SELECT ef.championship_id, ef.champion_part  AS participant_id, 1 AS place
    FROM elim_finals ef
    JOIN championships c ON c.id = ef.championship_id AND c.format != 'desafio' AND c.status = 'encerrado'
    WHERE ef.champion_part IS NOT NULL

    UNION ALL

    -- Elim: vice (2º)
    SELECT ef.championship_id, ef.runner_up_part, 2
    FROM elim_finals ef
    JOIN championships c ON c.id = ef.championship_id AND c.format != 'desafio' AND c.status = 'encerrado'
    WHERE ef.runner_up_part IS NOT NULL

    UNION ALL

    -- Elim: 3º lugar (bronze)
    SELECT bm.championship_id, bm.third_part, 3
    FROM bronze_matches bm
    JOIN championships c ON c.id = bm.championship_id AND c.format != 'desafio' AND c.status = 'encerrado'
    WHERE bm.third_part IS NOT NULL

    UNION ALL

    -- Liga: top 3
    SELECT ls.championship_id, ls.participant_id, ls.place::int
    FROM liga_standings ls
    JOIN championships c ON c.id = ls.championship_id AND c.status = 'encerrado' AND c.format = 'liga'
    WHERE ls.place <= 3
  ),

  -- Converte participant_id → user_id
  user_podium AS (
    SELECT DISTINCT ON (pm.user_id, pp.championship_id)
      pm.user_id,
      pp.championship_id,
      pp.place,
      c.is_official
    FROM podium_parts pp
    JOIN participant_members pm ON pm.participant_id = pp.participant_id
    JOIN championships c ON c.id = pp.championship_id
  ),

  -- Bônus por colocação
  placement_bonus AS (
    SELECT
      user_id,
      SUM(
        CASE
          WHEN is_official AND place = 1 THEN 15
          WHEN is_official AND place = 2 THEN 10
          WHEN is_official AND place = 3 THEN 5
          WHEN NOT is_official AND place = 1 THEN 5
          WHEN NOT is_official AND place = 2 THEN 3
          WHEN NOT is_official AND place = 3 THEN 1
          ELSE 0
        END
      )::int AS bonus
    FROM user_podium
    GROUP BY user_id
  ),

  -- Bônus por participação em campeonato oficial (5 pts por campeonato encerrado)
  participation_bonus AS (
    SELECT
      pm.user_id,
      (COUNT(DISTINCT c.id) * 5)::int AS bonus
    FROM championships c
    JOIN participants p  ON p.championship_id = c.id AND p.enrollment_status = 'confirmado'
    JOIN participant_members pm ON pm.participant_id = p.id
    WHERE c.is_official AND c.status = 'encerrado' AND c.format != 'desafio'
    GROUP BY pm.user_id
  ),

  -- Agrega tudo por usuário
  final AS (
    SELECT
      pr.id                                                           AS user_id,
      pr.full_name,
      pr.avatar_url,
      pr.category_id,
      COALESCE(g.game_points, 0)                                     AS game_points,
      COALESCE(pb.bonus, 0) + COALESCE(part.bonus, 0)               AS bonus_points,
      COALESCE(g.game_points, 0) + COALESCE(pb.bonus, 0)
        + COALESCE(part.bonus, 0)                                    AS points,
      COALESCE(g.wins, 0)                                            AS wins,
      COALESCE(g.losses, 0)                                          AS losses,
      COALESCE(g.played, 0)                                          AS played,
      COALESCE(g.set_balance, 0)                                     AS set_balance
    FROM profiles pr
    LEFT JOIN game_agg          g    ON g.user_id    = pr.id
    LEFT JOIN placement_bonus   pb   ON pb.user_id   = pr.id
    LEFT JOIN participation_bonus part ON part.user_id = pr.id
    WHERE
      -- só inclui quem tem alguma participação ou bônus
      (COALESCE(g.played, 0) > 0 OR COALESCE(pb.bonus, 0) > 0 OR COALESCE(part.bonus, 0) > 0)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
  )

  SELECT
    f.user_id,
    f.full_name,
    f.avatar_url,
    f.category_id,
    cat.name  AS category_name,
    f.points,
    f.game_points,
    f.bonus_points,
    f.wins,
    f.losses,
    f.played,
    f.set_balance,
    ROW_NUMBER() OVER (ORDER BY f.points DESC, f.set_balance DESC, f.wins DESC) AS rank
  FROM final f
  LEFT JOIN categories cat ON cat.id = f.category_id
  ORDER BY rank;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings(uuid) TO authenticated, anon;
