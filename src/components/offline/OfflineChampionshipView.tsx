'use client'

// Renderização OFFLINE de um campeonato ou desafio REAL (criado online) a partir
// do cache (refreshChampCache). Usado pelo shell /~offline.
//
//  • OfflineChampMatches: jogos por grupo / rodada / fase da chave, com a
//    classificação recalculada no aparelho (liga, grupos, desafio).
//  • OfflineScore: a tela de placar REAL (ScoreScreen + useScoreEngine), que já
//    enfileira o placar offline e sincroniza ao reconectar.
//
// Sobre o cache vai a fila deste aparelho (effectiveMatches): placar,
// encerramento automático pelo placar e avanço do vencedor na chave — a próxima
// rodada abre sem internet. O servidor recalcula tudo ao sincronizar.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, User, WifiOff } from 'lucide-react'
import { getCachedChamp, type CachedChamp, type CachedMatch } from '@/lib/offline/champ-cache'
import { effectiveMatches, stageOf } from '@/lib/offline/cached-bracket'
import { aggregateTeamStandings, computeStandings, resolveMatch, type CMatch } from '@/lib/standings/compute'
import { SYNC_EVENT, getQueuedMatchState, type QueuedMatchState } from '@/lib/score-engine/SyncEngine'
import { ScoreScreen } from '@/components/score/ScoreScreen'
import { StandingsGrid, type Standing } from '@/components/campeonatos/StandingsTable'
import { OfflineBackButton } from '@/components/offline/OfflineBackButton'

export type OfflineBasePath = '/campeonatos' | '/desafios'

function NotCached({ basePath }: { basePath: OfflineBasePath }) {
  const what = basePath === '/desafios' ? 'Este desafio' : 'Este campeonato'
  return (
    <div
      className="min-h-dvh grid place-items-center px-6 text-center"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #16233a 100%)' }}
    >
      <div className="max-w-xs space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary/12 grid place-items-center ring-1 ring-secondary/25">
          <WifiOff className="h-7 w-7 text-secondary/70" />
        </div>
        <h1 className="text-lg font-bold text-white">Você está offline</h1>
        <p className="text-sm text-white/55 leading-relaxed">
          {what} ainda não foi carregado offline. Abra-o uma vez com internet
          para que os jogos fiquem disponíveis sem conexão.
        </p>
        <OfflineBackButton fallbackHref={basePath} className="w-full" />
      </div>
    </div>
  )
}

/**
 * Campeonato do cache com a fila deste aparelho por cima. Recalcula quando a
 * fila muda (placar lançado, sincronização concluída).
 */
function useEffectiveChamp(champId: string) {
  const [state, setState] = useState<{ champ: CachedChamp | null; matches: CachedMatch[] } | null>(null)

  const load = useCallback(async () => {
    const champ = await getCachedChamp(champId)
    if (!champ) return { champ: null, matches: [] }
    const queued = new Map<string, QueuedMatchState | null>()
    await Promise.all(
      champ.matches.map(async (m) => queued.set(m.id, await getQueuedMatchState(m.id))),
    )
    return { champ, matches: effectiveMatches(champ, queued) }
  }, [champId])

  useEffect(() => {
    let cancelled = false
    const run = () => {
      void load().then((s) => {
        if (!cancelled) setState(s)
      })
    }
    run()
    window.addEventListener(SYNC_EVENT, run)
    return () => {
      cancelled = true
      window.removeEventListener(SYNC_EVENT, run)
    }
  }, [load])

  return state
}

const hasSide = (id: string | null | undefined, name: string | null) =>
  id === undefined ? !!name : !!id

function bracketLabel(m: CachedMatch, maxRound: number): string {
  if (m.bracketSlot === -2) return 'Disputa de 3º lugar'
  if (m.bracketSlot === -1) return 'Final'
  const left = maxRound - m.round
  if (left === 0) return 'Final'
  if (left === 1) return 'Semifinal'
  if (left === 2) return 'Quartas de final'
  if (left === 3) return 'Oitavas de final'
  return `Rodada ${m.round}`
}

type Section = { key: string; title: string | null; matches: CachedMatch[] }

function buildSections(champ: CachedChamp, matches: CachedMatch[]): Section[] {
  const sections: Section[] = []

  // Grupos (grupos + eliminatórias)
  const groups = champ.groups ?? []
  for (const g of groups) {
    const ms = matches.filter((m) => m.groupId === g.id).sort((a, b) => a.round - b.round)
    if (ms.length) sections.push({ key: `g-${g.id}`, title: g.name, matches: ms })
  }

  const rest = matches.filter((m) => !m.groupId || !groups.some((g) => g.id === m.groupId))
  const isBracket = (m: CachedMatch) => m.bracketSlot !== null && m.bracketSlot !== undefined
  const roundRobin = rest.filter((m) => !isBracket(m))
  const bracket = rest.filter(isBracket)

  // Liga / desafio: por rodada
  const byRound = new Map<number, CachedMatch[]>()
  for (const m of roundRobin) byRound.set(m.round, [...(byRound.get(m.round) ?? []), m])
  const rounds = [...byRound.keys()].sort((x, y) => x - y)
  for (const r of rounds) {
    sections.push({ key: `r-${r}`, title: rounds.length > 1 ? `Rodada ${r}` : null, matches: byRound.get(r)! })
  }

  // Chave: por fase (terceiro lugar logo antes da final)
  const maxRound = Math.max(0, ...bracket.filter((m) => (m.bracketSlot ?? 0) > 0).map((m) => m.round))
  const byPhase = new Map<string, CachedMatch[]>()
  const order = [...bracket].sort((a, b) => {
    const ka = a.bracketSlot === -2 ? maxRound - 0.5 : a.bracketSlot === -1 ? 1e6 : a.round
    const kb = b.bracketSlot === -2 ? maxRound - 0.5 : b.bracketSlot === -1 ? 1e6 : b.round
    return ka - kb || (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0)
  })
  for (const m of order) {
    const label = bracketLabel(m, maxRound)
    byPhase.set(label, [...(byPhase.get(label) ?? []), m])
  }
  for (const [label, ms] of byPhase) sections.push({ key: `b-${label}`, title: label, matches: ms })

  return sections
}

const toCMatch = (m: CachedMatch): CMatch => ({
  side_a_participant_id: m.sideAId ?? null,
  side_b_participant_id: m.sideBId ?? null,
  games: m.games,
  status: m.status,
  result: m.result,
  is_wo: m.isWo,
  is_double_wo: m.isDoubleWo,
})

type StandingsBlock = { key: string; title: string | null; rows: Standing[] }

/** Classificação recalculada no aparelho (mesma regra do servidor). */
function buildStandings(champ: CachedChamp, matches: CachedMatch[]): StandingsBlock[] {
  if (!champ.cfg || !champ.sides) return []
  const cfg = champ.cfg
  const sides = champ.sides
  const ref = (ids: string[]) => ids.map((id) => ({ id, name: sides[id]?.name ?? null }))

  // pontos corridos = jogos fora da chave (e fora da final do desafio)
  const rr = matches.filter((m) => m.bracketSlot === null || m.bracketSlot === undefined)
  if (rr.length === 0) return []
  const stage = stageOf(rr[0])

  const groups = champ.groups ?? []
  if (groups.length > 0) {
    return groups.map((g) => {
      const ms = rr.filter((m) => m.groupId === g.id)
      const ids = [...new Set(ms.flatMap((m) => [m.sideAId, m.sideBId]).filter(Boolean) as string[])]
      return { key: g.id, title: g.name, rows: computeStandings(ms.map(toCMatch), ref(ids), stage, cfg) }
    })
  }

  const ids = [...new Set(rr.flatMap((m) => [m.sideAId, m.sideBId]).filter(Boolean) as string[])]
  const rows = computeStandings(rr.map(toCMatch), ref(ids), stage, cfg)

  // Desafio por times: soma dos jogadores de cada time (sem a final)
  if (champ.teams && champ.teams.length === 2 && champ.teamOf) {
    const teamOf = champ.teamOf
    return [
      { key: 'teams', title: 'Times', rows: aggregateTeamStandings(rows, champ.teams, (id) => teamOf[id]) },
      { key: 'players', title: 'Jogadores', rows },
    ]
  }
  return [{ key: 'all', title: null, rows }]
}

// ── Lista de jogos (substitui o detalhe offline) ─────────────────────────────
export function OfflineChampMatches({
  champId,
  basePath = '/campeonatos',
}: {
  champId: string
  basePath?: OfflineBasePath
}) {
  const state = useEffectiveChamp(champId)
  const champ = state?.champ ?? null
  const matches = useMemo(() => state?.matches ?? [], [state])
  const sections = useMemo(() => (champ ? buildSections(champ, matches) : []), [champ, matches])
  const standings = useMemo(() => (champ ? buildStandings(champ, matches) : []), [champ, matches])
  const [tab, setTab] = useState<'jogos' | 'classificacao'>('jogos')

  if (!state) return null
  if (!champ) return <NotCached basePath={basePath} />

  const avatars = Object.fromEntries(Object.entries(champ.sides ?? {}).map(([id, s]) => [id, s.avatarUrl]))
  const mine = champ.myParticipantIds?.[0] ?? null

  return (
    <div className="px-5 py-4 space-y-4">
      <Link href={basePath} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-white">{champ.name}</h1>
        <span className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold text-yellow-400/80">
          Offline
        </span>
      </div>

      {standings.length > 0 && (
        <div className="glass glass-pill flex p-1 text-xs font-semibold">
          {(['jogos', 'classificacao'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full py-1.5 transition ${
                tab === t ? 'bg-secondary text-primary' : 'text-white/55'
              }`}
            >
              {t === 'jogos' ? 'Jogos' : 'Classificação'}
            </button>
          ))}
        </div>
      )}

      {tab === 'classificacao' && standings.length > 0 ? (
        <div className="space-y-4">
          {standings.map((b) => (
            <div key={b.key} className="space-y-2">
              {b.title && (
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 px-1">{b.title}</p>
              )}
              <div className="glass glass-card overflow-hidden">
                <StandingsGrid standings={b.rows} currentUserParticipantId={mine} participantAvatars={avatars} />
              </div>
            </div>
          ))}
          <p className="px-1 text-[10px] leading-relaxed text-white/25">
            Calculada neste aparelho com os placares lançados offline. Confirmada pelo servidor ao sincronizar.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.key} className="space-y-2">
              {s.title && sections.length > 1 && (
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 px-1">{s.title}</p>
              )}
              {s.matches.map((m) => (
                <MatchRow key={m.id} m={m} href={`${basePath}/${champId}/jogos/${m.id}`} />
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-white/30 text-center px-4">
        Offline: lance os placares normalmente. Vencedores já avançam na chave; tudo sincroniza quando você voltar a ficar online.
      </p>
    </div>
  )
}

function MatchRow({ m, href }: { m: CachedMatch; href: string }) {
  const res = resolveMatch(m.games, stageOf(m))
  const a = hasSide(m.sideAId, m.sideA.name)
  const b = hasSide(m.sideBId, m.sideB.name)
  // Folga (bye): só um lado e já encerrada pelo servidor.
  const bye = m.status === 'finalizado' && a !== b
  const playable = a && b
  const inner = (
    <>
      <Side info={m.sideA} winner={m.result === 'lado_a'} pending={!a} />
      <div className="shrink-0 text-center min-w-[3rem]">
        {bye ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">folga</span>
        ) : m.status === 'finalizado' && m.isWo ? (
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80">
            {m.isDoubleWo ? 'W.O. duplo' : 'W.O.'}
          </span>
        ) : res.finalized || m.games.length > 0 ? (
          <span className="text-sm font-black tabular-nums text-white/80">
            {m.counting === 'tempo' && m.games[0] ? (
              <>{m.games[0].score_a}<span className="text-white/25 mx-0.5">×</span>{m.games[0].score_b}</>
            ) : (
              <>{res.setsA}<span className="text-white/25 mx-0.5">×</span>{res.setsB}</>
            )}
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/20">vs</span>
        )}
        {!bye && (
          <p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/25">
            {m.status === 'finalizado' ? 'fim' : m.games.length > 0 ? 'ao vivo' : 'agendado'}
          </p>
        )}
      </div>
      <Side info={m.sideB} winner={m.result === 'lado_b'} pending={!b} alignRight />
    </>
  )
  return playable ? (
    <Link href={href} className="glass glass-card w-full flex items-center gap-3 px-4 py-3 transition active:scale-[0.985]">
      {inner}
    </Link>
  ) : (
    <div className="glass glass-card w-full flex items-center gap-3 px-4 py-3 opacity-60">{inner}</div>
  )
}

// ── Tela de placar REAL renderizada offline a partir do cache ────────────────
export function OfflineScore({
  champId,
  matchId,
  basePath = '/campeonatos',
}: {
  champId: string
  matchId: string
  basePath?: OfflineBasePath
}) {
  // Carrega uma vez: depois a própria tela (useScoreEngine) cuida do estado.
  const [data, setData] = useState<{ champ: CachedChamp; match: CachedMatch } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const champ = await getCachedChamp(champId)
      let match: CachedMatch | undefined
      if (champ) {
        const queued = new Map<string, QueuedMatchState | null>()
        await Promise.all(
          champ.matches.map(async (m) => queued.set(m.id, await getQueuedMatchState(m.id))),
        )
        // Com a chave avançada: a vaga preenchida offline já mostra os lados.
        match = effectiveMatches(champ, queued).find((m) => m.id === matchId)
      }
      if (cancelled) return
      setData(champ && match ? { champ, match } : null)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [champId, matchId])

  if (!loaded) return null
  if (!data) return <NotCached basePath={basePath} />

  const { champ, match } = data
  const mine = champ.myParticipantIds ?? []
  const plays = [match.sideAId, match.sideBId].some((id) => !!id && mine.includes(id))
  return (
    <div className="px-5 py-4">
      <ScoreScreen
        matchId={match.id}
        backHref={`${basePath}/${champId}`}
        sideA={match.sideA}
        sideB={match.sideB}
        counting={match.counting}
        setsToPlay={match.setsToPlay}
        pointsPerSet={match.pointsPerSet}
        winByTwo={match.winByTwo}
        setDrawEnabled={match.setDrawEnabled}
        timeMinutes={match.timeMinutes}
        // Organizador marca tudo; jogador, só a própria partida (igual online).
        canManage={champ.canManage || plays}
        // Sem isto a finalização offline ia para finalize_match_by_participant,
        // que o servidor recusa p/ quem não joga a partida.
        isOrganizer={champ.canManage}
        allowDoubleWo={(match.bracketSlot ?? 0) === 0}
        // Reabrir, limpar e mudar a data vão pela fila: também offline.
        canReopen={champ.canManage}
        canClear={champ.canManage}
        canSchedule={champ.canManage}
        initialGames={match.games}
        initialStatus={match.status}
        initialResult={match.result}
        initialIsWo={match.isWo}
        initialIsDoubleWo={match.isDoubleWo}
        initialConflictSnapshot={null}
      />
    </div>
  )
}

// Linha de um lado da partida
function Side({
  info,
  winner,
  pending,
  alignRight,
}: {
  info: { name: string | null; avatarUrl: string | null }
  winner: boolean
  pending?: boolean
  alignRight?: boolean
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${alignRight ? 'flex-row-reverse text-right' : ''}`}>
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-secondary/10 ring-1 ring-white/10 grid place-items-center">
        {info.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-4 w-4 text-secondary/50" />
        )}
      </div>
      <span className={`truncate text-sm font-medium ${winner ? 'text-secondary' : pending ? 'text-white/30 italic' : 'text-white/80'}`}>
        {info.name ?? (pending ? 'A definir' : '—')}
      </span>
    </div>
  )
}
