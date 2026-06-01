'use client'

// Renderização OFFLINE de um campeonato REAL (criado online) a partir do cache
// gravado quando o detalhe foi aberto com internet. Usado pelo shell /~offline.
//
//  • OfflineChampMatches: lista de jogos (link → tela de placar).
//  • OfflineScore: a tela de placar REAL (ScoreScreen + useScoreEngine), que já
//    enfileira o placar offline e sincroniza ao reconectar.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, User, WifiOff } from 'lucide-react'
import { getCachedChamp, getCachedMatch, type CachedChamp, type CachedMatch } from '@/lib/offline/champ-cache'
import { resolveMatch, mergeGames } from '@/lib/standings/compute'
import { getQueuedGames } from '@/lib/score-engine/SyncEngine'
import { ScoreScreen } from '@/components/score/ScoreScreen'

function NotCached() {
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
          Este campeonato ainda não foi carregado offline. Abra-o uma vez com
          internet para que os jogos fiquem disponíveis sem conexão.
        </p>
      </div>
    </div>
  )
}

// ── Lista de jogos (substitui o detalhe offline) ─────────────────────────────
export function OfflineChampMatches({ champId }: { champId: string }) {
  const [champ, setChamp] = useState<CachedChamp | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const c = await getCachedChamp(champId)
      if (c) {
        // Mescla os placares lançados offline (fila do motor) p/ exibição ao vivo.
        c.matches = await Promise.all(
          c.matches.map(async (m) => {
            const queued = await getQueuedGames(m.id)
            return { ...m, games: mergeGames(m.games, queued) }
          }),
        )
      }
      if (cancelled) return
      setChamp(c)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [champId])

  if (!loaded) return null
  if (!champ) return <NotCached />

  const byRound = new Map<number, CachedMatch[]>()
  for (const m of champ.matches) {
    const arr = byRound.get(m.round) ?? []
    arr.push(m)
    byRound.set(m.round, arr)
  }
  const rounds = [...byRound.keys()].sort((x, y) => x - y)

  return (
    <div className="px-5 py-4 space-y-4">
      <Link href="/campeonatos" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-white">{champ.name}</h1>
        <span className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold text-yellow-400/80">
          Offline
        </span>
      </div>

      <div className="space-y-4">
        {rounds.map((r) => (
          <div key={r} className="space-y-2">
            {rounds.length > 1 && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 px-1">
                Rodada {r}
              </p>
            )}
            {byRound.get(r)!.map((m) => {
              const res = resolveMatch(m.games, {
                counting: m.counting,
                points_per_set: m.pointsPerSet,
                win_by_two: m.winByTwo,
                set_draw_enabled: m.setDrawEnabled,
                sets_to_play: m.setsToPlay,
              })
              const playable = m.sideA.name && m.sideB.name
              const inner = (
                <>
                  <Side info={m.sideA} winner={m.result === 'lado_a'} />
                  <div className="shrink-0 text-center min-w-[3rem]">
                    {res.finalized || m.games.length > 0 ? (
                      <span className="text-sm font-black tabular-nums text-white/80">
                        {res.setsA}<span className="text-white/25 mx-0.5">×</span>{res.setsB}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/20">vs</span>
                    )}
                    <p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/25">
                      {m.status === 'finalizado' ? 'fim' : m.games.length > 0 ? 'ao vivo' : 'agendado'}
                    </p>
                  </div>
                  <Side info={m.sideB} winner={m.result === 'lado_b'} alignRight />
                </>
              )
              return playable ? (
                <Link
                  key={m.id}
                  href={`/campeonatos/${champId}/jogos/${m.id}`}
                  className="glass glass-card w-full flex items-center gap-3 px-4 py-3 transition active:scale-[0.985]"
                >
                  {inner}
                </Link>
              ) : (
                <div key={m.id} className="glass glass-card w-full flex items-center gap-3 px-4 py-3 opacity-60">
                  {inner}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-white/30 text-center px-4">
        Offline: lance os placares normalmente. Tudo sincroniza quando você voltar a ficar online.
      </p>
    </div>
  )
}

// ── Tela de placar REAL renderizada offline a partir do cache ────────────────
export function OfflineScore({ champId, matchId }: { champId: string; matchId: string }) {
  const [data, setData] = useState<{ champ: CachedChamp; match: CachedMatch } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getCachedMatch(champId, matchId).then((d) => {
      setData(d)
      setLoaded(true)
    })
  }, [champId, matchId])

  if (!loaded) return null
  if (!data) return <NotCached />

  const { champ, match } = data
  return (
    <div className="px-5 py-4">
      <ScoreScreen
        matchId={match.id}
        backHref={`/campeonatos/${champId}`}
        sideA={match.sideA}
        sideB={match.sideB}
        counting={match.counting}
        setsToPlay={match.setsToPlay}
        pointsPerSet={match.pointsPerSet}
        winByTwo={match.winByTwo}
        setDrawEnabled={match.setDrawEnabled}
        timeMinutes={match.timeMinutes}
        canManage={champ.canManage}
        initialGames={match.games}
        initialStatus={match.status}
        initialResult={match.result}
        initialConflictSnapshot={null}
      />
    </div>
  )
}

// Linha de um lado da partida
function Side({
  info,
  winner,
  alignRight,
}: {
  info: { name: string | null; avatarUrl: string | null }
  winner: boolean
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
      <span className={`truncate text-sm font-medium ${winner ? 'text-secondary' : 'text-white/80'}`}>
        {info.name ?? '—'}
      </span>
    </div>
  )
}
