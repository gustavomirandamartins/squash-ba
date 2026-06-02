'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Users, User, Trophy, Flag } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { ManageBar } from '@/components/ManageBar'
import { getQueuedGames } from '@/lib/score-engine/SyncEngine'
import { computeStandings, resolveMatch, mergeGames, type StageCfg, type ChampCfg } from '@/lib/standings/compute'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TeamInfo = { id: string; name: string }

export type TeamParticipant = {
  id: string
  teamId: string | null
  full_name: string | null
  avatar_url: string | null
}

export type TeamMatch = {
  id: string
  round: number
  status: string
  result: string | null
  side_a_participant_id: string | null
  side_b_participant_id: string | null
  score_a: number
  score_b: number
  bracket_slot: number | null
  match_games?: Array<{ game_number: number; score_a: number; score_b: number }>
}

export type GeneralStanding = {
  participant_id: string
  display_name: string | null
  pontos: number
  v: number
  e: number
  d: number
  sets_ganhos: number
  sets_perdidos: number
}

export type TeamStanding = {
  championship_team_id: string
  team_name: string
  v: number
  e: number
  d: number
  sets_ganhos: number
  sets_perdidos: number
  pontos_favor: number
  pontos_contra: number
}

export type TeamChallenge = {
  id: string
  name: string
  status: string
  rounds: number
  hasFinal: boolean
}

type Props = {
  challenge: TeamChallenge
  teams: TeamInfo[]
  participants: TeamParticipant[]
  matches: TeamMatch[]
  general: GeneralStanding[]
  teamStandings: TeamStanding[]
  canManage: boolean
  finalExists: boolean
  /** config p/ recálculo offline ao vivo (opcional) */
  stage?: StageCfg
  champ?: ChampCfg
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: 'Rascunho',     cls: 'bg-white/8 text-white/45' },
  ativo:     { label: 'Em andamento', cls: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado',    cls: 'bg-white/5 text-white/30' },
}

const MATCH_STATUS: Record<string, { label: string; cls: string; dot?: boolean }> = {
  agendado:     { label: 'A realizar', cls: 'text-white/30' },
  em_andamento: { label: 'Ao vivo',    cls: 'text-secondary', dot: true },
  finalizado:   { label: 'Encerrado',  cls: 'text-white/35' },
}

function Avatar({ p, size = 28 }: { p: TeamParticipant | undefined; size?: number }) {
  if (p?.avatar_url) {
    return (
      <Image src={p.avatar_url} alt={p.full_name ?? ''} width={size} height={size}
        className="rounded-full object-cover shrink-0 ring-1 ring-white/10" style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full bg-secondary/15 grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <User className="text-secondary/50" style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  )
}

type TabId = 'jogos' | 'geral' | 'times'

// ─── Component ─────────────────────────────────────────────────────────────────

export function TeamChallengeView({
  challenge, teams, participants, matches, general, teamStandings, canManage,
  stage, champ,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('times')
  const [generatingFinal, setGeneratingFinal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const badge = STATUS[challenge.status] ?? STATUS.rascunho
  const pById = new Map(participants.map((p) => [p.id, p]))
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))

  const teamA = teams[0]
  const teamB = teams[1]

  // ── Recálculo offline ao vivo (snapshot + fila de placares) ────────────────
  const [offline, setOffline] = useState(false)
  const [effMatches, setEffMatches] = useState<TeamMatch[]>(matches)
  const [effGeneral, setEffGeneral] = useState<GeneralStanding[]>(general)
  const [effTeam, setEffTeam] = useState<TeamStanding[]>(teamStandings)

  const recompute = useCallback(async () => {
    if (!stage || !champ) return
    // 1) jogos efetivos
    const em: TeamMatch[] = await Promise.all(
      matches.map(async (m) => {
        const queued = await getQueuedGames(m.id)
        const games = mergeGames(m.match_games ?? [], queued)
        const r = resolveMatch(games, stage)
        return {
          ...m,
          score_a: r.setsA,
          score_b: r.setsB,
          result: r.result,
          status: r.finalized ? 'finalizado' : games.length > 0 ? 'em_andamento' : m.status,
        }
      }),
    )
    setEffMatches(em)

    // 2) classificação geral (só jogos da fase, sem a final bracket_slot=-1)
    const cmatches = await Promise.all(
      matches
        .filter((m) => m.bracket_slot !== -1)
        .map(async (m) => {
          const queued = await getQueuedGames(m.id)
          return {
            side_a_participant_id: m.side_a_participant_id,
            side_b_participant_id: m.side_b_participant_id,
            games: mergeGames(m.match_games ?? [], queued),
          }
        }),
    )
    const parts = participants.map((p) => ({ id: p.id, name: p.full_name }))
    const standings = computeStandings(cmatches, parts, stage, champ)
    setEffGeneral(standings)

    // 3) classificação por time (agrega a geral por championship_team_id)
    const teamAgg = new Map<string, TeamStanding>()
    for (const t of teams) {
      teamAgg.set(t.id, {
        championship_team_id: t.id, team_name: t.name,
        v: 0, e: 0, d: 0, sets_ganhos: 0, sets_perdidos: 0, pontos_favor: 0, pontos_contra: 0,
      })
    }
    for (const s of standings) {
      const teamId = pById.get(s.participant_id)?.teamId
      if (!teamId) continue
      const agg = teamAgg.get(teamId)
      if (!agg) continue
      agg.v += s.v; agg.e += s.e; agg.d += s.d
      agg.sets_ganhos += s.sets_ganhos; agg.sets_perdidos += s.sets_perdidos
      agg.pontos_favor += s.pontos_favor; agg.pontos_contra += s.pontos_contra
    }
    setEffTeam([...teamAgg.values()])
  }, [matches, participants, teams, stage, champ, pById])

  useEffect(() => {
    const isOff = typeof navigator !== 'undefined' && !navigator.onLine
    setOffline(isOff)
    if (isOff) void recompute()
    else { setEffMatches(matches); setEffGeneral(general); setEffTeam(teamStandings) }

    const onOnline = () => { setOffline(false); setEffMatches(matches); setEffGeneral(general); setEffTeam(teamStandings) }
    const onOffline = () => { setOffline(true); void recompute() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [matches, general, teamStandings, recompute])

  const mainMatches = effMatches.filter((m) => m.bracket_slot !== -1)
  const finalMatch = effMatches.find((m) => m.bracket_slot === -1) ?? null
  const allMainDone = mainMatches.length > 0 && mainMatches.every((m) => m.status === 'finalizado')

  async function handleGenerateFinal() {
    setGeneratingFinal(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.rpc('generate_team_challenge_final', {
      _championship_id: challenge.id,
    })
    setGeneratingFinal(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  // standings internos por time (derivado da geral)
  const generalByTeam = (teamId: string) =>
    effGeneral.filter((g) => pById.get(g.participant_id)?.teamId === teamId)

  return (
    <div className="px-5 py-4 space-y-4">
      <Link href="/jogos" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition">
        <ChevronLeft className="h-4 w-4" />
        Jogos
      </Link>

      {canManage && <ManageBar id={challenge.id} basePath="/desafios" listPath="/jogos" />}

      {/* Hero */}
      <div className="glass glass-card px-4 py-3.5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
          <Users className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-white leading-snug truncate">{challenge.name}</h1>
          <p className="text-xs text-white/40 mt-0.5 truncate">
            Desafio por times · {teamA?.name ?? 'Time 1'} × {teamB?.name ?? 'Time 2'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
      </div>

      {/* Placar agregado por time */}
      {effTeam.length === 2 && (
        <div className="glass glass-card px-5 py-4 flex items-center gap-3">
          {[0, 1].map((i) => {
            const ts = effTeam.find((t) => t.championship_team_id === teams[i]?.id)
            return (
              <div key={i} className="flex-1 text-center min-w-0">
                <p className="text-xs font-semibold text-white/70 truncate">{teams[i]?.name ?? '—'}</p>
                <p className="text-2xl font-black text-white tabular-nums mt-1">{ts?.v ?? 0}</p>
                <p className="text-[10px] text-white/30">vitórias</p>
              </div>
            )
          })}
        </div>
      )}

      {offline && (
        <p className="px-1 text-[11px] font-semibold text-yellow-400/80">
          Offline · classificação recalculada neste dispositivo
        </p>
      )}

      {/* Tabs */}
      <div className="glass glass-pill p-1 flex gap-0.5">
        {([['times', 'Por time'], ['geral', 'Geral'], ['jogos', 'Jogos']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
              tab === id ? 'bg-secondary text-primary' : 'text-white/40 hover:text-white/65'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Por time ── */}
      {tab === 'times' && (
        <div className="space-y-4 reveal">
          {/* Classificação por equipe */}
          <div className="glass glass-card overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">
              Classificação por equipe
            </p>
            {effTeam
              .slice()
              .sort((a, b) => b.v - a.v || (b.sets_ganhos - b.sets_perdidos) - (a.sets_ganhos - a.sets_perdidos))
              .map((ts, i) => (
                <div key={ts.championship_team_id} className="flex items-center gap-3 px-4 py-3 border-t border-white/5">
                  <span className={`text-sm font-bold w-5 text-center ${i === 0 ? 'text-yellow-400' : 'text-white/30'}`}>{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold text-white/85 truncate">{ts.team_name}</span>
                  <span className="text-xs text-white/40 tabular-nums">{ts.v}V {ts.d}D</span>
                  <span className="text-sm font-bold text-secondary tabular-nums w-8 text-right">{ts.v}</span>
                </div>
              ))}
          </div>

          {/* Classificação interna de cada time */}
          {teams.map((t) => {
            const rows = generalByTeam(t.id)
            if (rows.length === 0) return null
            return (
              <div key={t.id} className="glass glass-card overflow-hidden">
                <p className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-secondary/70">
                  {t.name}
                </p>
                {rows.map((g, i) => (
                  <InternalRow key={g.participant_id} pos={i + 1} g={g} p={pById.get(g.participant_id)} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Geral ── */}
      {tab === 'geral' && (
        <div className="glass glass-card overflow-hidden reveal">
          <p className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">
            Classificação geral
          </p>
          {effGeneral.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-white/30">Sem partidas finalizadas ainda.</p>
          ) : (
            effGeneral.map((g, i) => (
              <InternalRow
                key={g.participant_id}
                pos={i + 1}
                g={g}
                p={pById.get(g.participant_id)}
                teamName={teamNameById.get(pById.get(g.participant_id)?.teamId ?? '') ?? null}
              />
            ))
          )}
        </div>
      )}

      {/* ── Jogos ── */}
      {tab === 'jogos' && (
        <div className="space-y-2 reveal">
          {mainMatches.length === 0 ? (
            <div className="glass glass-card px-4 py-10 text-center">
              <p className="text-sm text-white/30">Nenhum jogo gerado ainda.</p>
            </div>
          ) : (
            mainMatches.map((m) => (
              <MatchRow key={m.id} m={m} challengeId={challenge.id} pById={pById} />
            ))
          )}

          {/* Final */}
          {challenge.hasFinal && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Trophy className="h-3.5 w-3.5 text-yellow-400/70" />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-yellow-400/70">Final</p>
              </div>
              {finalMatch ? (
                <MatchRow m={finalMatch} challengeId={challenge.id} pById={pById} />
              ) : canManage ? (
                <>
                  <button
                    type="button"
                    disabled={!allMainDone || generatingFinal}
                    onClick={handleGenerateFinal}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-secondary/90 py-3 text-sm font-bold text-primary transition active:scale-95 disabled:opacity-40"
                  >
                    <Flag className="h-4 w-4" />
                    {generatingFinal ? 'Gerando…' : 'Gerar final (melhor de cada time)'}
                  </button>
                  {!allMainDone && (
                    <p className="text-center text-[11px] text-white/30">
                      Finalize todos os jogos para gerar a final.
                    </p>
                  )}
                </>
              ) : (
                <p className="px-1 text-xs text-white/30">A final será gerada pelo organizador.</p>
              )}
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InternalRow({
  pos, g, p, teamName,
}: {
  pos: number
  g: GeneralStanding
  p: TeamParticipant | undefined
  teamName?: string | null
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-white/5">
      <span className={`text-xs font-bold w-4 text-center ${pos === 1 ? 'text-yellow-400' : 'text-white/25'}`}>{pos}</span>
      <Avatar p={p} size={26} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/85 truncate">{g.display_name ?? '—'}</p>
        {teamName && <p className="text-[10px] text-white/35 truncate">{teamName}</p>}
      </div>
      <span className="text-[11px] text-white/40 tabular-nums">{g.v}V {g.d}D</span>
      <span className="text-sm font-bold text-secondary tabular-nums w-7 text-right">{g.pontos}</span>
    </div>
  )
}

function MatchRow({
  m, challengeId, pById,
}: {
  m: TeamMatch
  challengeId: string
  pById: Map<string, TeamParticipant>
}) {
  const pA = m.side_a_participant_id ? pById.get(m.side_a_participant_id) : undefined
  const pB = m.side_b_participant_id ? pById.get(m.side_b_participant_id) : undefined
  const st = MATCH_STATUS[m.status] ?? MATCH_STATUS.agendado
  const winnerA = m.result === 'lado_a'
  const winnerB = m.result === 'lado_b'
  const hasScore = m.status !== 'agendado'
  const sortedGames = [...(m.match_games ?? [])].sort((a, b) => a.game_number - b.game_number)
  const showGameDetail = m.status === 'finalizado' && sortedGames.length >= 2

  return (
    <Link href={`/desafios/${challengeId}/jogos/${m.id}`}
      className="glass glass-card px-4 py-3 flex flex-col gap-1.5 active:scale-[0.985] transition-transform">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar p={pA} size={26} />
          <span className={`text-[13px] truncate font-medium ${winnerA ? 'text-secondary' : 'text-white/80'}`}>{pA?.full_name ?? '—'}</span>
        </div>
        <div className="shrink-0 w-12 text-center flex flex-col items-center">
          {hasScore ? (
            <span className={`text-base font-bold tabular-nums ${m.status === 'finalizado' ? 'text-white' : 'text-white/70'}`}>{m.score_a}–{m.score_b}</span>
          ) : (
            <span className="text-[10px] font-semibold text-white/20 tracking-[0.15em] uppercase">vs</span>
          )}
          {showGameDetail && (
            <span className="text-[10px] text-white/30 tabular-nums mt-0.5 leading-tight">
              {sortedGames.map((g) => `${g.score_a}·${g.score_b}`).join('  ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className={`text-[13px] truncate text-right font-medium ${winnerB ? 'text-secondary' : 'text-white/80'}`}>{pB?.full_name ?? '—'}</span>
          <Avatar p={pB} size={26} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {st.dot && <span className="h-1.5 w-1.5 rounded-full bg-secondary inline-block" />}
          <span className={`text-[11px] font-medium ${st.cls}`}>{st.label}</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
      </div>
    </Link>
  )
}
