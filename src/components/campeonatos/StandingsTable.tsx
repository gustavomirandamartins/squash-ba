'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { User } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useChampionshipRealtime } from '@/lib/use-championship-realtime'
import { getQueuedMatchState } from '@/lib/score-engine/SyncEngine'
import {
  computeStandings,
  overlayQueuedState,
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
    /** estado da partida no snapshot (p/ contar encerramento manual, DQ e W.O.) */
    status?: string
    result?: string | null
    is_wo?: boolean
    is_double_wo?: boolean
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

// ─── Grid template ────────────────────────────────────────────────────────────
// Mobile (9): # · Jogador · Pts · J · V · SG · PF · PC · Saldo
// Desktop md+ (12): # · Jogador · Pts · J · V · E · D · SG · SP · PF · PC · Saldo
// E, D e SP só aparecem no desktop (HIDE_MOBILE).
const ROW =
  'grid grid-cols-[1rem_1fr_1.75rem_1.25rem_1.25rem_1.5rem_1.75rem_1.75rem_2.1rem]' +
  ' md:grid-cols-[1.5rem_1fr_2.75rem_2rem_1.75rem_1.75rem_1.75rem_2.5rem_2.5rem_2.75rem_2.75rem_3rem]' +
  ' gap-x-1 md:gap-x-1.5 items-center px-3'
const HIDE_MOBILE = 'hidden md:block'


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

// ─── Grade (header + linhas) — reutilizada pela tela do campeonato provisório ──

export function StandingsGrid({
  standings,
  currentUserParticipantId,
  participantAvatars,
}: {
  standings: Standing[]
  currentUserParticipantId: string | null
  participantAvatars: Record<string, string | null>
}) {
  return (
    <>
    {/* Header da tabela */}
    <div className={`${ROW} py-2 border-b border-white/8`}>
      <span className="text-[10px] text-white/25 text-center">#</span>
      <span className="text-[10px] text-white/25">Jogador</span>
      <span className="text-[10px] text-white/35 text-center font-semibold" title="Pontos">Pts</span>
      <span className="text-[10px] text-white/25 text-center" title="Partidas">J</span>
      <span className="text-[10px] text-white/25 text-center" title="Vitórias">V</span>
      <span className={`${HIDE_MOBILE} text-[10px] text-white/25 text-center`} title="Empates">E</span>
      <span className={`${HIDE_MOBILE} text-[10px] text-white/25 text-center`} title="Derrotas">D</span>
      <span className="text-[10px] text-white/25 text-center" title="Sets vencidos">SG</span>
      <span className={`${HIDE_MOBILE} text-[10px] text-white/25 text-center`} title="Sets perdidos">SP</span>
      <span className="text-[10px] text-white/25 text-center" title="Pontos a favor">PF</span>
      <span className="text-[10px] text-white/25 text-center" title="Pontos contra">PC</span>
      <span className="text-[10px] text-white/25 text-center" title="Saldo de pontos">Saldo</span>
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
              {/* Avatar some em telas estreitas: o espaço vai para as colunas de estatística */}
              {avatar ? (
                <Image
                  src={avatar}
                  alt={row.display_name ?? ''}
                  width={22}
                  height={22}
                  style={{ width: 22, height: 22 }}
                  className="rounded-full object-cover shrink-0 ring-1 ring-white/10 max-[430px]:hidden"
                />
              ) : (
                <div className="h-[22px] w-[22px] rounded-full bg-secondary/10 grid place-items-center shrink-0 max-[430px]:hidden">
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

            {/* J (partidas) */}
            <div className="text-center">
              <span className="text-xs tabular-nums text-white/55">
                {row.v + row.e + row.d}
              </span>
            </div>

            {/* V */}
            <div className="text-center">
              <span className="text-xs tabular-nums text-white/65">
                {row.v}
              </span>
            </div>

            {/* E (desktop) */}
            <div className={`${HIDE_MOBILE} text-center`}>
              <span className="text-xs tabular-nums text-white/40">
                {row.e}
              </span>
            </div>

            {/* D (desktop) */}
            <div className={`${HIDE_MOBILE} text-center`}>
              <span className="text-xs tabular-nums text-white/35">
                {row.d}
              </span>
            </div>

            {/* SG (sets vencidos) */}
            <div className="text-center">
              <span className="text-xs tabular-nums text-white/50">
                {row.sets_ganhos}
              </span>
            </div>

            {/* SP (desktop) */}
            <div className={`${HIDE_MOBILE} text-center`}>
              <span className="text-xs tabular-nums text-white/35">
                {row.sets_perdidos}
              </span>
            </div>

            {/* PF */}
            <div className="text-center">
              <span className="text-xs tabular-nums text-white/50">
                {row.pontos_favor}
              </span>
            </div>

            {/* PC */}
            <div className="text-center">
              <span className="text-xs tabular-nums text-white/35">
                {row.pontos_contra}
              </span>
            </div>

            {/* Saldo */}
            <div className="text-center">
              <span className={`text-xs tabular-nums font-medium ${saldoColor(row.saldo_pontos)}`}>
                {row.saldo_pontos > 0 ? '+' : ''}
                {row.saldo_pontos}
              </span>
            </div>
          </div>
        )
      })
    )}
    </>
  )
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
          const st = overlayQueuedState(
            {
              games: m.match_games,
              status: m.status ?? 'agendado',
              result: m.result ?? null,
              isWo: m.is_wo ?? false,
              isDoubleWo: m.is_double_wo ?? false,
            },
            await getQueuedMatchState(m.id),
          )
          return {
            side_a_participant_id: m.side_a_participant_id,
            side_b_participant_id: m.side_b_participant_id,
            games: st.games,
            status: st.status,
            result: st.result,
            is_wo: st.isWo,
            is_double_wo: st.isDoubleWo,
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

  // Tempo real só deste campeonato, com recargas agrupadas.
  useChampionshipRealtime(supabase, championshipId, `standings-${championshipId}`, () => {
    void refetchRef.current()
  })

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
        <StandingsGrid
          standings={standings}
          currentUserParticipantId={currentUserParticipantId}
          participantAvatars={participantAvatars}
        />
      </div>

      {/* Legenda */}
      <p className="text-[10px] text-white/18 px-1 leading-relaxed">
        Pts = pontos · J = partidas · V/E/D = vitória/empate/derrota · SG/SP = sets vencidos/perdidos · PF/PC = pontos a favor/contra · Saldo = PF − PC
      </p>
    </div>
  )
}
