'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { User } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getQueuedGames } from '@/lib/score-engine/SyncEngine'
import {
  computeStandings,
  mergeGames,
  type CMatch,
  type StageCfg,
  type ChampCfg,
  type ParticipantRef,
} from '@/lib/standings/compute'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Standing = {
  position: number
  participant_id: string
  display_name: string | null
  pontos: number
  v: number
  e: number
  d: number
  sets_ganhos: number
  sets_perdidos: number
  sets_empatados: number
  pontos_favor: number
  pontos_contra: number
  saldo_pontos: number
}

/** Dados para recomputar a classificação offline (refletindo placares na fila). */
export type OfflineStandingsData = {
  matches: Array<{
    id: string
    side_a_participant_id: string | null
    side_b_participant_id: string | null
    match_games: Array<{ game_number: number; score_a: number; score_b: number }>
  }>
  participants: ParticipantRef[]
  stage: StageCfg
  champ: ChampCfg
}

type Props = {
  championshipId: string
  champStatus: string
  initialStandings: Standing[]
  /** participantId do usuário logado (para highlight) */
  currentUserParticipantId: string | null
  /** avatarUrl indexado por participantId */
  participantAvatars: Record<string, string | null>
  /** dados p/ cálculo offline ao vivo (opcional; quando ausente, só usa RPC) */
  offlineData?: OfflineStandingsData
}

// ─── Grid template (mobile: 6 colunas | desktop md+: 11 colunas) ──────────────
const ROW =
  'grid grid-cols-[1.5rem_1fr_2.75rem_1.75rem_1.75rem_1.75rem]' +
  ' md:grid-cols-[1.5rem_1fr_2.75rem_1.75rem_1.75rem_1.75rem_2.5rem_2.5rem_2.75rem_2.75rem_3rem]' +
  ' gap-x-1.5 items-center px-3'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function saldoColor(v: number) {
  if (v > 0) return 'text-secondary/75'
  if (v < 0) return 'text-red-400/60'
  return 'text-white/30'
}

function positionColor(pos: number) {
  if (pos === 1) return 'text-yellow-400 font-bold'
  if (pos === 2) return 'text-white/50 font-semibold'
  if (pos === 3) return 'text-orange-400/70 font-semibold'
  return 'text-white/20'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StandingsTable({
  championshipId,
  champStatus,
  initialStandings,
  currentUserParticipantId,
  participantAvatars,
  offlineData,
}: Props) {
  const [standings, setStandings] = useState<Standing[]>(initialStandings)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)

  // Browser client — criado uma vez (lazy initializer do useState)
  const [supabase] = useState(() => createClient())

  // ref para garantir que o callback do canal sempre veja a versão mais recente
  const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Recalcula no cliente a partir do snapshot + fila offline de placares.
  const computeOffline = useCallback(async () => {
    if (!offlineData) return
    setRefreshing(true)
    try {
      const cmatches: CMatch[] = await Promise.all(
        offlineData.matches.map(async (m) => {
          const queued = await getQueuedGames(m.id)
          return {
            side_a_participant_id: m.side_a_participant_id,
            side_b_participant_id: m.side_b_participant_id,
            games: mergeGames(m.match_games, queued),
          }
        }),
      )
      setStandings(computeStandings(cmatches, offlineData.participants, offlineData.stage, offlineData.champ))
    } finally {
      setRefreshing(false)
    }
  }, [offlineData])

  const refetch = useCallback(async () => {
    // Offline → calcula no cliente (reflete placares na fila).
    if (typeof navigator !== 'undefined' && !navigator.onLine && offlineData) {
      await computeOffline()
      return
    }
    setRefreshing(true)
    try {
      const { data, error } = await supabase.rpc('get_standings', {
        _championship_id: championshipId,
      })
      if (!error && data) {
        setStandings(data as Standing[])
      } else if (error && offlineData) {
        // RPC falhou (provável offline) → fallback client-side.
        await computeOffline()
      }
    } finally {
      setRefreshing(false)
    }
  }, [supabase, championshipId, offlineData, computeOffline])

  // Mantém ref sempre atualizada (evita stale closure no canal)
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  // Estado online/offline → no mount offline já recalcula localmente; ao trocar
  // de estado, recomputa (offline) ou rebusca no servidor (online).
  useEffect(() => {
    const off = typeof navigator !== 'undefined' && !navigator.onLine
    setOffline(off)
    if (off) void refetchRef.current()

    const onOnline = () => { setOffline(false); void refetchRef.current() }
    const onOffline = () => { setOffline(true); void refetchRef.current() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Subscrição Realtime — segue o padrão do spec exatamente
  useEffect(() => {
    const channel = supabase
      .channel(`standings-${championshipId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `championship_id=eq.${championshipId}`,
        },
        () => { void refetchRef.current() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_games' },
        () => { void refetchRef.current() },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, championshipId]) // refetchRef é estável, não entra nas deps

  const isLive = champStatus === 'ativo'

  return (
    <div className="space-y-3">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
          Classificação
        </p>
        {offline ? (
          <span className="text-[11px] font-semibold text-yellow-400/80">Offline · local</span>
        ) : isLive ? (
          <div className="flex items-center gap-1.5">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-secondary inline-block" />
            <span className="text-[11px] font-semibold text-secondary">Ao vivo</span>
          </div>
        ) : null}
      </div>

      {/* Tabela */}
      <div
        className={[
          'glass glass-card overflow-hidden transition-opacity duration-300',
          refreshing ? 'opacity-55' : 'opacity-100',
        ].join(' ')}
      >
        {/* Header da tabela */}
        <div className={`${ROW} py-2 border-b border-white/8`}>
          <span className="text-[10px] text-white/25 text-center">#</span>
          <span className="text-[10px] text-white/25">Jogador</span>
          <span className="text-[10px] text-white/35 text-center font-semibold">Pts</span>
          <span className="text-[10px] text-white/25 text-center">V</span>
          <span className="text-[10px] text-white/25 text-center">E</span>
          <span className="text-[10px] text-white/25 text-center">D</span>
          {/* Desktop-only */}
          <span className="hidden md:block text-[10px] text-white/20 text-center">SG</span>
          <span className="hidden md:block text-[10px] text-white/20 text-center">SP</span>
          <span className="hidden md:block text-[10px] text-white/20 text-center">PF</span>
          <span className="hidden md:block text-[10px] text-white/20 text-center">PC</span>
          <span className="hidden md:block text-[10px] text-white/20 text-center">Saldo</span>
        </div>

        {/* Linhas */}
        {standings.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-white/25">
              Nenhuma partida finalizada ainda.
            </p>
          </div>
        ) : (
          standings.map((row, i) => {
            const isMe = row.participant_id === currentUserParticipantId
            const avatar = participantAvatars[row.participant_id] ?? null

            return (
              <div
                key={row.participant_id}
                className={[
                  ROW,
                  'py-2.5',
                  i < standings.length - 1 ? 'border-b border-white/5' : '',
                  isMe
                    ? 'bg-secondary/6 ring-inset ring-1 ring-secondary/18'
                    : '',
                ].join(' ')}
              >
                {/* Posição */}
                <div className="flex justify-center">
                  <span className={`text-xs ${positionColor(row.position)}`}>
                    {row.position}
                  </span>
                </div>

                {/* Jogador */}
                <div className="flex items-center gap-1.5 min-w-0">
                  {avatar ? (
                    <Image
                      src={avatar}
                      alt={row.display_name ?? ''}
                      width={22}
                      height={22}
                      style={{ width: 22, height: 22 }}
                      className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="h-[22px] w-[22px] rounded-full bg-secondary/10 grid place-items-center shrink-0">
                      <User className="h-[11px] w-[11px] text-secondary/40" />
                    </div>
                  )}
                  <span
                    className={`text-xs leading-tight truncate ${
                      isMe
                        ? 'text-secondary font-semibold'
                        : 'text-white/75'
                    }`}
                  >
                    {row.display_name ?? '—'}
                  </span>
                </div>

                {/* Pontos */}
                <div className="text-center">
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      isMe ? 'text-secondary' : 'text-white'
                    }`}
                  >
                    {row.pontos}
                  </span>
                </div>

                {/* V */}
                <div className="text-center">
                  <span className="text-xs tabular-nums text-white/65">
                    {row.v}
                  </span>
                </div>

                {/* E */}
                <div className="text-center">
                  <span className="text-xs tabular-nums text-white/40">
                    {row.e}
                  </span>
                </div>

                {/* D */}
                <div className="text-center">
                  <span className="text-xs tabular-nums text-white/35">
                    {row.d}
                  </span>
                </div>

                {/* Desktop-only */}
                <div className="hidden md:block text-center">
                  <span className="text-xs tabular-nums text-white/50">
                    {row.sets_ganhos}
                  </span>
                </div>
                <div className="hidden md:block text-center">
                  <span className="text-xs tabular-nums text-white/35">
                    {row.sets_perdidos}
                  </span>
                </div>
                <div className="hidden md:block text-center">
                  <span className="text-xs tabular-nums text-white/50">
                    {row.pontos_favor}
                  </span>
                </div>
                <div className="hidden md:block text-center">
                  <span className="text-xs tabular-nums text-white/35">
                    {row.pontos_contra}
                  </span>
                </div>
                <div className="hidden md:block text-center">
                  <span className={`text-xs tabular-nums font-medium ${saldoColor(row.saldo_pontos)}`}>
                    {row.saldo_pontos > 0 ? '+' : ''}
                    {row.saldo_pontos}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Legenda */}
      <p className="text-[10px] text-white/18 px-1 leading-relaxed">
        Pts = pontos · V/E/D = vitória/empate/derrota · SG/SP = sets ganhos/perdidos · PF/PC = pontos a favor/contra
      </p>
    </div>
  )
}
