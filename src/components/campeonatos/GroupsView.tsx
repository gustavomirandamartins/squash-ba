'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { User, Check, ArrowRight, Layers, GitMerge } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { Standing } from './StandingsTable'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Group = { id: string; name: string }

export type ParticipantInfo = {
  full_name: string | null
  avatar_url: string | null
}

type MatchMeta = {
  id: string
  status: string
  stage_id: string
  side_a_participant_id: string | null
  side_b_participant_id: string | null
}

type Props = {
  championshipId: string
  champStatus: string
  groups: Group[]
  /** participantId → groupId */
  participantGroups: Record<string, string>
  initialStandings: Standing[]
  participantInfo: Record<string, ParticipantInfo>
  participantAvatars: Record<string, string | null>
  currentUserParticipantId: string | null
  gruposStageId: string | null
  elimStageId: string | null
  onSwitchToBracket?: () => void
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

function GroupCard({
  group,
  standings,
  qualifiersPerGroup,
  hasPending,
  allDone,
  currentUserParticipantId,
  participantInfo,
  participantAvatars,
}: {
  group: Group
  standings: Standing[]
  qualifiersPerGroup: number
  hasPending: boolean
  allDone: boolean
  currentUserParticipantId: string | null
  participantInfo: Record<string, ParticipantInfo>
  participantAvatars: Record<string, string | null>
}) {
  return (
    <div className="shrink-0 w-[268px] glass glass-card overflow-hidden">
      {/* ── Header ── */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/8">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-secondary/60 shrink-0" />
          <span className="text-xs font-bold text-secondary">Grupo {group.name}</span>
        </div>
        {hasPending && (
          <div className="flex items-center gap-1">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-secondary inline-block shrink-0" />
            <span className="text-[10px] font-semibold text-secondary">Em andamento</span>
          </div>
        )}
        {allDone && !hasPending && (
          <div className="flex items-center gap-1">
            <Check className="h-3 w-3 text-white/30 shrink-0" strokeWidth={2.5} />
            <span className="text-[10px] text-white/30">Encerrado</span>
          </div>
        )}
      </div>

      {/* ── Column headers ── */}
      <div
        className="grid items-center px-3 py-1.5 border-b border-white/5 text-[9px] text-white/20"
        style={{ gridTemplateColumns: '1rem 1fr 2rem 1.5rem 1.5rem 1.5rem' }}
      >
        <span className="text-center">#</span>
        <span>Jogador</span>
        <span className="text-center font-semibold text-white/30">Pts</span>
        <span className="text-center">V</span>
        <span className="text-center">E</span>
        <span className="text-center">D</span>
      </div>

      {/* ── Rows ── */}
      {standings.length === 0 ? (
        <div className="px-3.5 py-5 text-center">
          <p className="text-[11px] text-white/20">Aguardando jogos…</p>
        </div>
      ) : (
        standings.map((row, i) => {
          const isClassified = i < qualifiersPerGroup
          const isMe = row.participant_id === currentUserParticipantId
          const avatar = participantAvatars[row.participant_id] ?? null
          const info = participantInfo[row.participant_id]
          const name = info?.full_name ?? row.display_name ?? '—'
          const firstName = name.split(' ')[0] ?? name

          return (
            <div
              key={row.participant_id}
              className={[
                'grid items-center px-3 py-[7px]',
                i < standings.length - 1 ? 'border-b border-white/5' : '',
                isClassified && !isMe ? 'bg-secondary/[0.04]' : '',
                isMe ? 'bg-secondary/[0.08] ring-inset ring-1 ring-secondary/25' : '',
              ].join(' ')}
              style={{ gridTemplateColumns: '1rem 1fr 2rem 1.5rem 1.5rem 1.5rem' }}
            >
              {/* Position */}
              <span
                className={`text-[10px] text-center font-bold ${
                  i === 0
                    ? 'text-secondary'
                    : i === 1
                      ? 'text-white/40'
                      : 'text-white/20'
                }`}
              >
                {i + 1}
              </span>

              {/* Player */}
              <div className="flex items-center gap-1.5 min-w-0">
                {avatar ? (
                  <Image
                    src={avatar}
                    alt={name}
                    width={18}
                    height={18}
                    className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
                  />
                ) : (
                  <div
                    className={`h-[18px] w-[18px] rounded-full grid place-items-center shrink-0 ${
                      isClassified ? 'bg-secondary/15' : 'bg-white/8'
                    }`}
                  >
                    <User
                      className={`h-[9px] w-[9px] ${isClassified ? 'text-secondary/60' : 'text-white/25'}`}
                    />
                  </div>
                )}
                <span
                  className={`text-[11px] leading-tight truncate font-medium ${
                    isMe
                      ? 'text-secondary'
                      : isClassified
                        ? 'text-white/85'
                        : 'text-white/55'
                  }`}
                >
                  {firstName}
                </span>
                {isClassified && (
                  <span className="shrink-0 text-[7.5px] font-bold text-secondary/80 bg-secondary/12 rounded-full px-1 py-px leading-none">
                    Q
                  </span>
                )}
              </div>

              {/* Pts */}
              <div className="text-center">
                <span
                  className={`text-[11px] font-bold tabular-nums ${
                    isMe ? 'text-secondary' : 'text-white/85'
                  }`}
                >
                  {row.pontos}
                </span>
              </div>

              {/* V */}
              <div className="text-center">
                <span className="text-[10px] tabular-nums text-white/55">{row.v}</span>
              </div>

              {/* E */}
              <div className="text-center">
                <span className="text-[10px] tabular-nums text-white/35">{row.e}</span>
              </div>

              {/* D */}
              <div className="text-center">
                <span className="text-[10px] tabular-nums text-white/30">{row.d}</span>
              </div>
            </div>
          )
        })
      )}

      {/* ── Footer: classificados legend ── */}
      {standings.length > 0 && qualifiersPerGroup > 0 && (
        <div className="px-3 py-2 border-t border-white/5 flex items-center gap-1.5">
          <span className="text-[8px] font-bold text-secondary/70 bg-secondary/10 rounded-full px-1.5 py-px leading-none">
            Q
          </span>
          <span className="text-[9px] text-white/25">
            {qualifiersPerGroup === 1
              ? 'Classificado (1º lugar)'
              : `Top ${qualifiersPerGroup} classificados`}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── GroupsView ───────────────────────────────────────────────────────────────

export function GroupsView({
  championshipId,
  champStatus,
  groups,
  participantGroups,
  initialStandings,
  participantInfo,
  participantAvatars,
  currentUserParticipantId,
  gruposStageId,
  elimStageId,
  onSwitchToBracket,
}: Props) {
  const [standings, setStandings] = useState<Standing[]>(initialStandings)
  const [matches, setMatches] = useState<MatchMeta[]>([])
  const [supabase] = useState(() => createClient())
  const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const refetch = useCallback(async () => {
    const [sResult, mResult] = await Promise.all([
      supabase.rpc('get_standings', { _championship_id: championshipId }),
      supabase
        .from('matches')
        .select('id, status, stage_id, side_a_participant_id, side_b_participant_id')
        .eq('championship_id', championshipId),
    ])
    if (sResult.data) setStandings(sResult.data as Standing[])
    if (mResult.data) setMatches(mResult.data as MatchMeta[])
  }, [supabase, championshipId])

  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    const channel = supabase
      .channel(`groups-view-${championshipId}`)
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

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, championshipId])

  // ── Computed ────────────────────────────────────────────────────────────────

  const gruposMatches = matches.filter((m) => m.stage_id === gruposStageId)
  const elimMatches   = matches.filter((m) => m.stage_id === elimStageId)

  const allGroupsDone =
    gruposMatches.length > 0 &&
    gruposMatches.every((m) => m.status === 'finalizado')

  const bracketGenerated = elimMatches.length > 0

  // Standings per group
  const standingsByGroup: Record<string, Standing[]> = {}
  for (const g of groups) {
    standingsByGroup[g.id] = standings
      .filter((s) => participantGroups[s.participant_id] === g.id)
      .sort((a, b) => a.position - b.position)
  }

  // Group sizes from participantGroups
  const groupSizes: Record<string, number> = {}
  for (const gid of Object.values(participantGroups)) {
    groupSizes[gid] = (groupSizes[gid] ?? 0) + 1
  }

  function qualifiersPerGroup(groupId: string): number {
    return Math.ceil((groupSizes[groupId] ?? 0) / 2)
  }

  // Per-group pending / all-done detection
  function groupMatchState(groupId: string): { hasPending: boolean; allDone: boolean } {
    const gpIds = new Set(
      Object.entries(participantGroups)
        .filter(([, gid]) => gid === groupId)
        .map(([pid]) => pid),
    )
    const groupMs = gruposMatches.filter(
      (m) =>
        (m.side_a_participant_id && gpIds.has(m.side_a_participant_id)) ||
        (m.side_b_participant_id && gpIds.has(m.side_b_participant_id)),
    )
    if (groupMs.length === 0) return { hasPending: false, allDone: false }
    const hasPending = groupMs.some((m) => m.status !== 'finalizado')
    const allDone    = !hasPending
    return { hasPending, allDone }
  }

  const isLive = champStatus === 'ativo'

  return (
    <div className="space-y-4">
      {/* ── Live indicator ── */}
      {isLive && !allGroupsDone && (
        <div className="flex items-center gap-2 px-1">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-secondary inline-block" />
          <span className="text-[11px] font-semibold text-secondary">Ao vivo</span>
          <span className="text-[11px] text-white/30">— tabelas atualizam automaticamente</span>
        </div>
      )}

      {/* ── "Bracket gerado" banner ── */}
      {allGroupsDone && bracketGenerated && (
        <div
          className="glass glass-card px-4 py-3 flex items-center justify-between gap-3"
          style={{ borderColor: 'rgba(205,253,81,0.35)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <GitMerge className="h-4 w-4 text-secondary/80 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-secondary leading-snug">
                Fase de grupos encerrada
              </p>
              <p className="text-[11px] text-white/45 mt-0.5">
                Bracket gerado — confrontos da fase eliminatória disponíveis.
              </p>
            </div>
          </div>
          {onSwitchToBracket && (
            <button
              type="button"
              onClick={onSwitchToBracket}
              className="shrink-0 flex items-center gap-1 rounded-full bg-secondary/20 px-3 py-1.5 text-[11px] font-semibold text-secondary transition active:scale-95"
            >
              Ver bracket
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* ── Group cards (horizontal scroll) ── */}
      {groups.length === 0 ? (
        <div className="glass glass-card px-4 py-10 text-center">
          <p className="text-sm text-white/25">Grupos não encontrados.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
          {groups.map((group) => {
            const { hasPending, allDone } = groupMatchState(group.id)
            return (
              <GroupCard
                key={group.id}
                group={group}
                standings={standingsByGroup[group.id] ?? []}
                qualifiersPerGroup={qualifiersPerGroup(group.id)}
                hasPending={hasPending}
                allDone={allDone}
                currentUserParticipantId={currentUserParticipantId}
                participantInfo={participantInfo}
                participantAvatars={participantAvatars}
              />
            )
          })}
        </div>
      )}

      {/* ── Footer legend ── */}
      {groups.length > 0 && standings.length > 0 && (
        <p className="text-[10px] text-white/18 px-1 leading-relaxed">
          Pts = pontos · V/E/D = vitória/empate/derrota · Q = classificado para o bracket
        </p>
      )}
    </div>
  )
}
