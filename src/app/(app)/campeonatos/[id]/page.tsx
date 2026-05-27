import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, Trophy, User } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'

export const metadata = { title: 'Campeonato' }

const FORMAT_LABEL: Record<string, string> = {
  liga: 'Liga',
  grupos_elim: 'Grupos + Eliminatórias',
  eliminatoria: 'Eliminatórias',
  desafio: 'Desafio',
}

const UNIT_LABEL: Record<string, string> = {
  player: 'Jogador (1v1)',
  pair: 'Dupla (2v2)',
  team: 'Time',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  rascunho: { label: 'Rascunho', className: 'bg-white/8 text-white/50' },
  ativo: { label: 'Ativo', className: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado', className: 'bg-white/5 text-white/30' },
}

const TIEBREAKER_LABELS: Record<string, string> = {
  sets_ganhos: 'Sets ganhos',
  pontos_ganhos: 'Pontos ganhos',
  pontos_sofridos_asc: 'Menos pontos sofridos',
}

export default async function ChampionshipPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Query championship with stages and participant membership
  const { data: champ } = await supabase
    .from('championships')
    .select(
      `id, name, format, unit, status, allow_draw,
       points_win, points_draw, points_loss, tiebreakers, created_at,
       championship_stages(
         id, name, kind, counting, rounds,
         sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes
       ),
       participants(
         id,
         participant_members(user_id)
       )`,
    )
    .eq('id', id)
    .single()

  if (!champ) notFound()

  // Collect all user_ids to batch-fetch profiles
  const userIds = (champ.participants ?? []).flatMap((p) =>
    (p.participant_members ?? []).map((m: { user_id: string }) => m.user_id),
  )

  const { data: profiles } = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds)
    : { data: [] }

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p]),
  )

  // Flatten participants → one player per row
  const players = (champ.participants ?? [])
    .flatMap((p) =>
      (p.participant_members ?? []).map((m: { user_id: string }) => ({
        participantId: p.id,
        profile: profileMap.get(m.user_id) ?? {
          id: m.user_id,
          full_name: null,
          avatar_url: null,
        },
      })),
    )

  const stage =
    champ.championship_stages && champ.championship_stages.length > 0
      ? champ.championship_stages[0]
      : null

  const badge = STATUS_BADGE[champ.status] ?? STATUS_BADGE.rascunho

  const countingDesc = stage
    ? stage.counting === 'set'
      ? `Por set — ${stage.sets_to_play === 1 ? '1 set' : `MD${stage.sets_to_play}`}, ${stage.points_per_set} pts/set`
      : `Por tempo — ${stage.time_minutes} min`
    : '—'

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Back nav */}
      <Link
        href="/campeonatos"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition"
      >
        <ChevronLeft className="h-4 w-4" />
        Campeonatos
      </Link>

      {/* Hero card */}
      <div className="glass glass-card px-4 py-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
            <Trophy className="h-5 w-5 text-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-white leading-snug">
              {champ.name}
            </h1>
            <p className="text-xs text-white/45 mt-0.5">
              {FORMAT_LABEL[champ.format] ?? champ.format} ·{' '}
              {UNIT_LABEL[champ.unit] ?? champ.unit}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        <div className="h-px bg-white/8" />

        {/* Config */}
        <div className="space-y-2">
          {stage && (
            <>
              <Row label="Rodadas" value={`${stage.rounds}× round-robin`} />
              <Row label="Contagem" value={countingDesc} />
            </>
          )}
          <Row
            label="Pontuação"
            value={`V ${champ.points_win} · ${champ.allow_draw ? `E ${champ.points_draw} · ` : ''}D ${champ.points_loss}`}
          />
          <div>
            <p className="text-xs text-white/40 mb-1">Desempate</p>
            <ol className="list-decimal list-inside space-y-0.5">
              {((champ.tiebreakers as string[]) ?? []).map((k) => (
                <li key={k} className="text-xs text-white/55">
                  {TIEBREAKER_LABELS[k] ?? k}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Participantes
          </p>
          <span className="text-xs text-white/40">{players.length}</span>
        </div>

        {players.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/30">
            Nenhum participante cadastrado.
          </p>
        ) : (
          players.map(({ participantId, profile }) => (
            <div
              key={participantId}
              className="glass glass-card flex items-center gap-3 px-3.5 py-2.5"
            >
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.full_name ?? ''}
                  width={36}
                  height={36}
                  className="rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-secondary/15 grid place-items-center shrink-0">
                  <User className="h-4 w-4 text-secondary/60" />
                </div>
              )}
              <span className="text-sm text-white/85">
                {profile.full_name ?? 'Sem nome'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Placeholder for future sections (4C) */}
      <div className="glass glass-card px-4 py-4 text-center space-y-1">
        <p className="text-sm font-medium text-white/40">Jogos e tabela</p>
        <p className="text-xs text-white/25">
          Geração de confrontos e classificação chegam na próxima fase.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-white/40 shrink-0">{label}</span>
      <span className="text-xs text-white/80 text-right">{value}</span>
    </div>
  )
}
