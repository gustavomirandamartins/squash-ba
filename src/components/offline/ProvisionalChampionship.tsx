'use client'

// Visualizador de campeonato Liga "provisório" (criado offline, ainda não
// sincronizado). Recebe o tempId por prop para poder ser usado tanto na rota
// /pendentes/[tempId] quanto no shell offline (/~offline) — ambas client-side.

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, CloudOff, Loader2, AlertTriangle, Trash2, User,
} from 'lucide-react'
import { getOutbox, removeFromOutbox, updateOutbox, OUTBOX_EVENT } from '@/lib/offline/outbox'
import type { OutboxItem } from '@/lib/offline/types'
import {
  getLocalChampionship, removeLocalChampionship, type LocalChampionship,
} from '@/lib/offline/local-championship'
import { takeLocalSynced } from '@/lib/offline/reconcile-liga'
import { computeStandings, resolveMatch } from '@/lib/standings/compute'
import { LocalScoreScreen } from '@/components/score/LocalScoreScreen'

export function ProvisionalChampionship({ tempId }: { tempId: string }) {
  const router = useRouter()

  const [item, setItem] = useState<OutboxItem | null>(null)
  const [champ, setChamp] = useState<LocalChampionship | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<'jogos' | 'classificacao'>('jogos')
  const [openMatchId, setOpenMatchId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [all, c] = await Promise.all([getOutbox(), getLocalChampionship(tempId)])
    const found = all.find((i) => i.tempId === tempId) ?? null
    // Sincronizou: campeonato real criado → redireciona para ele.
    if (!found && !c) {
      const realId = await takeLocalSynced(tempId)
      if (realId) {
        router.replace(`/campeonatos/${realId}`)
        return
      }
    }
    setItem(found)
    setChamp(c)
    setLoaded(true)
  }, [tempId, router])

  useEffect(() => {
    void reload()
    const onChange = () => void reload()
    window.addEventListener(OUTBOX_EVENT, onChange)
    return () => window.removeEventListener(OUTBOX_EVENT, onChange)
  }, [reload])

  const backHref = item?.kind === 'desafio' ? '/jogos' : '/campeonatos'

  async function cancel() {
    await removeFromOutbox(tempId)
    await removeLocalChampionship(tempId)
    router.push(backHref)
  }

  async function retry() {
    await updateOutbox(tempId, { status: 'pending', error: undefined })
  }

  // ── Loading / vazio ────────────────────────────────────────────────────────
  if (loaded && !item && !champ) {
    return (
      <div className="px-5 py-8 space-y-4">
        <Link href="/campeonatos" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="glass glass-card px-4 py-10 text-center space-y-1.5">
          <p className="text-sm font-medium text-white/60">Item já sincronizado</p>
          <p className="text-xs text-white/35">
            Esta criação já foi enviada. Procure na lista de campeonatos ou jogos.
          </p>
        </div>
      </div>
    )
  }

  // ── Visualizador provisório (Liga local) ───────────────────────────────────
  if (champ) {
    const nameById = new Map(champ.participants.map((p) => [p.id, p]))

    // Sub-tela de placar
    if (openMatchId) {
      const m = champ.matches.find((x) => x.id === openMatchId)
      if (m) {
        const a = m.sideA ? nameById.get(m.sideA) : null
        const b = m.sideB ? nameById.get(m.sideB) : null
        return (
          <div className="px-5 py-4">
            <LocalScoreScreen
              tempId={tempId}
              matchId={m.id}
              sideA={{ name: a?.name ?? null, avatarUrl: a?.avatarUrl ?? null }}
              sideB={{ name: b?.name ?? null, avatarUrl: b?.avatarUrl ?? null }}
              stage={champ.stage}
              onBack={() => {
                setOpenMatchId(null)
                void reload()
              }}
            />
          </div>
        )
      }
    }

    const standings = computeStandings(
      champ.matches.map((m) => ({
        side_a_participant_id: m.sideA,
        side_b_participant_id: m.sideB,
        games: m.games,
      })),
      champ.participants.map((p) => ({ id: p.id, name: p.name })),
      champ.stage,
      champ.champ,
    )

    // Agrupa partidas por rodada
    const byRound = new Map<number, typeof champ.matches>()
    for (const m of champ.matches) {
      const arr = byRound.get(m.round) ?? []
      arr.push(m)
      byRound.set(m.round, arr)
    }
    const rounds = [...byRound.keys()].sort((x, y) => x - y)

    return (
      <div className="px-5 py-4 space-y-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">{champ.name}</h1>
            <span className="shrink-0 rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-bold text-secondary">
              Provisório
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/40">
            {item?.status === 'syncing' ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Sincronizando…</>
            ) : item?.status === 'error' ? (
              <><AlertTriangle className="h-3 w-3 text-red-400" /> Falha ao sincronizar</>
            ) : (
              <><CloudOff className="h-3 w-3 text-yellow-400/80" /> Liga · {champ.participants.length} {champ.unit === 'pair' ? 'duplas' : 'jogadores'} · será sincronizado ao reconectar</>
            )}
          </p>
        </div>

        {item?.status === 'error' && item.error && (
          <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-xs text-red-300">{item.error}</p>
        )}

        {/* Tabs */}
        <div className="glass glass-pill p-1 flex gap-0.5">
          {(['jogos', 'classificacao'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all ${
                tab === t ? 'bg-secondary text-primary' : 'text-white/40 hover:text-white/65'
              }`}
            >
              {t === 'jogos' ? 'Jogos' : 'Classificação'}
            </button>
          ))}
        </div>

        {/* Jogos */}
        {tab === 'jogos' && (
          <div className="space-y-4">
            {rounds.map((r) => (
              <div key={r} className="space-y-2">
                {rounds.length > 1 && (
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 px-1">
                    Rodada {r}
                  </p>
                )}
                {byRound.get(r)!.map((m) => {
                  const a = m.sideA ? nameById.get(m.sideA) : null
                  const b = m.sideB ? nameById.get(m.sideB) : null
                  const res = resolveMatch(m.games, champ.stage)
                  return (
                    <button
                      key={m.id}
                      onClick={() => setOpenMatchId(m.id)}
                      className="glass glass-card w-full flex items-center gap-3 px-4 py-3 text-left transition active:scale-[0.985]"
                    >
                      <Side info={a} winner={m.result === 'lado_a'} />
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
                      <Side info={b} winner={m.result === 'lado_b'} alignRight />
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* Classificação */}
        {tab === 'classificacao' && (
          <div className="glass glass-card overflow-hidden">
            <div className="grid grid-cols-[1.5rem_1fr_2.5rem_1.5rem_1.5rem_1.5rem_2.75rem] gap-x-1.5 items-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/30 border-b border-white/8">
              <span>#</span><span>Jogador</span><span className="text-center">Pts</span>
              <span className="text-center">V</span><span className="text-center">E</span><span className="text-center">D</span>
              <span className="text-center">Saldo</span>
            </div>
            {standings.map((s) => (
              <div
                key={s.participant_id}
                className="grid grid-cols-[1.5rem_1fr_2.5rem_1.5rem_1.5rem_1.5rem_2.75rem] gap-x-1.5 items-center px-3 py-2.5 border-b border-white/[0.04] last:border-0"
              >
                <span className={`text-xs font-bold ${s.position === 1 ? 'text-yellow-400' : 'text-white/30'}`}>{s.position}</span>
                <span className="text-sm text-white/85 truncate">{s.display_name ?? '—'}</span>
                <span className="text-center text-sm font-black tabular-nums text-secondary">{s.pontos}</span>
                <span className="text-center text-xs text-white/60 tabular-nums">{s.v}</span>
                <span className="text-center text-xs text-white/45 tabular-nums">{s.e}</span>
                <span className="text-center text-xs text-white/45 tabular-nums">{s.d}</span>
                <span className={`text-center text-xs tabular-nums ${s.saldo_pontos > 0 ? 'text-secondary/75' : s.saldo_pontos < 0 ? 'text-red-400/60' : 'text-white/30'}`}>
                  {s.saldo_pontos > 0 ? '+' : ''}{s.saldo_pontos}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Descartar */}
        <button
          type="button"
          onClick={() => void cancel()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 py-3 text-sm font-semibold text-red-300 transition active:scale-95 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
          Descartar campeonato
        </button>
      </div>
    )
  }

  // ── Fallback: card de status (criações sem snapshot local) ──────────────────
  return (
    <div className="px-5 py-4 space-y-4">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      {item && (
        <>
          <div className="glass glass-card px-5 py-6 text-center space-y-3">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06]">
              {item.status === 'syncing' ? (
                <Loader2 className="h-6 w-6 animate-spin text-secondary" />
              ) : item.status === 'error' ? (
                <AlertTriangle className="h-6 w-6 text-red-400" />
              ) : (
                <CloudOff className="h-6 w-6 text-yellow-400/80" />
              )}
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold tracking-tight text-white">{item.snapshot.name}</h1>
              <p className="mt-1 text-sm text-white/45">{item.snapshot.subtitle}</p>
            </div>
            <p className="text-xs leading-relaxed text-white/40 max-w-xs mx-auto">
              {item.status === 'syncing'
                ? 'Enviando para o servidor…'
                : item.status === 'error'
                  ? 'Não foi possível criar. Tente novamente quando estiver online.'
                  : 'Criado offline. Será enviado automaticamente assim que você reconectar.'}
            </p>
          </div>

          {item.status === 'error' && item.error && (
            <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-xs text-red-300">{item.error}</p>
          )}

          <div className="flex gap-2">
            {item.status === 'error' && (
              <button
                type="button"
                onClick={() => void retry()}
                className="flex-1 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-95"
              >
                Tentar novamente
              </button>
            )}
            <button
              type="button"
              onClick={() => void cancel()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 py-3 text-sm font-semibold text-red-300 transition active:scale-95 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Lado de uma partida (avatar + nome)
function Side({
  info,
  winner,
  alignRight,
}: {
  info: { name: string | null; avatarUrl: string | null } | null | undefined
  winner: boolean
  alignRight?: boolean
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${alignRight ? 'flex-row-reverse text-right' : ''}`}>
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-secondary/10 ring-1 ring-white/10 grid place-items-center">
        {info?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-4 w-4 text-secondary/50" />
        )}
      </div>
      <span className={`truncate text-sm font-medium ${winner ? 'text-secondary' : 'text-white/80'}`}>
        {info?.name ?? '—'}
      </span>
    </div>
  )
}
