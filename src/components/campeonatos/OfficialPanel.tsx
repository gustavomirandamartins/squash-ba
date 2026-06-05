'use client'

/**
 * OfficialPanel — bloco específico de Campeonatos Oficiais na página de detalhe.
 *
 * Mostra (quando is_official):
 *  • Cabeçalho oficial: descrição, local e período (datas).
 *  • Inscrição do jogador: solicitar / pendente / inscrito (status='rascunho').
 *  • Gestão (organizador, status='rascunho'): aprovar/recusar inscrições,
 *    adicionar jogador e "Iniciar campeonato".
 */

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Award, MapPin, CalendarRange, UserPlus, Check, X, Search, Rocket, Clock,
} from 'lucide-react'
import { loadPlayerPool } from '@/lib/offline/players-cache'
import {
  requestEnrollment,
  approveEnrollment,
  rejectEnrollment,
  addPlayerToChampionship,
  startOfficialChampionship,
} from '@/app/(app)/campeonatos/actions'

type Pending = { participantId: string; userId: string; name: string | null; avatarUrl: string | null }
type Pool = { id: string; full_name: string | null; avatar_url: string | null }

function Avatar({ name, url, size = 32 }: { name: string | null; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-white/10" style={{ width: size, height: size }} />
  }
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-secondary/15 text-[12px] font-bold text-secondary"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  )
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function OfficialPanel({
  champId,
  status,
  unit,
  canManage,
  description,
  venueName,
  startDate,
  endDate,
  myEnrollmentStatus,
  pendingEnrollments,
  confirmedCount,
  confirmedUserIds,
}: {
  champId: string
  status: string
  unit: string
  canManage: boolean
  description: string | null
  venueName: string | null
  startDate: string | null
  endDate: string | null
  myEnrollmentStatus: 'none' | 'pending' | 'confirmed'
  pendingEnrollments: Pending[]
  confirmedCount: number
  confirmedUserIds: string[]
}) {
  const router = useRouter()
  const [pending, startAction] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isOpen = status === 'rascunho'      // inscrições abertas
  const individual = unit === 'player'

  const startDateLabel = fmtDate(startDate)
  const endDateLabel = fmtDate(endDate)

  function run(fn: () => Promise<{ error?: string } | { ok: true }>) {
    setError(null)
    startAction(async () => {
      const res = await fn()
      if (res && 'error' in res && res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* Selo oficial + meta */}
      <div
        className="glass glass-card glass-official px-4 py-3.5 space-y-2.5"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-cane/20 px-2.5 py-0.5 text-[11px] font-bold text-cane">
            <Award className="h-3 w-3" />
            Campeonato oficial
          </span>
        </div>

        {description && (
          <p className="text-[13px] leading-relaxed text-white/70 whitespace-pre-line">{description}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/45">
          {venueName && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" /> {venueName}
            </span>
          )}
          {(startDateLabel || endDateLabel) && (
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="h-3 w-3 shrink-0" />
              {startDateLabel ?? '?'}{endDateLabel ? ` – ${endDateLabel}` : ''}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="glass glass-card px-3.5 py-2.5 text-xs text-red-300/90">{error}</div>
      )}

      {/* Inscrição do jogador (inscrições abertas) */}
      {isOpen && individual && (
        <EnrollmentCta
          status={myEnrollmentStatus}
          pending={pending}
          onRequest={() => run(() => requestEnrollment(champId))}
        />
      )}

      {/* Gestão do organizador */}
      {canManage && isOpen && (
        <ManageOfficial
          champId={champId}
          pendingEnrollments={pendingEnrollments}
          confirmedCount={confirmedCount}
          confirmedUserIds={confirmedUserIds}
          busy={pending}
          onApprove={(pid) => run(() => approveEnrollment(pid, champId))}
          onReject={(pid) => run(() => rejectEnrollment(pid, champId))}
          onAdd={(uid) => run(() => addPlayerToChampionship(champId, uid))}
          onStart={() => run(() => startOfficialChampionship(champId))}
        />
      )}
    </div>
  )
}

function EnrollmentCta({
  status,
  pending,
  onRequest,
}: {
  status: 'none' | 'pending' | 'confirmed'
  pending: boolean
  onRequest: () => void
}) {
  if (status === 'confirmed') {
    return (
      <div className="glass glass-card flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-cane">
        <Check className="h-4 w-4" /> Você está inscrito neste campeonato
      </div>
    )
  }
  if (status === 'pending') {
    return (
      <div className="glass glass-card flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-white/60">
        <Clock className="h-4 w-4 text-yellow-400/70" /> Inscrição pendente de aprovação
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onRequest}
      disabled={pending}
      className="glass glass-card glass-official flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-cane transition active:scale-[0.98] disabled:opacity-50"
    >
      <UserPlus className="h-4 w-4" />
      {pending ? 'Enviando…' : 'Solicitar inscrição'}
    </button>
  )
}

function ManageOfficial({
  champId,
  pendingEnrollments,
  confirmedCount,
  confirmedUserIds,
  busy,
  onApprove,
  onReject,
  onAdd,
  onStart,
}: {
  champId: string
  pendingEnrollments: Pending[]
  confirmedCount: number
  confirmedUserIds: string[]
  busy: boolean
  onApprove: (participantId: string) => void
  onReject: (participantId: string) => void
  onAdd: (userId: string) => void
  onStart: () => void
}) {
  return (
    <div className="glass glass-card px-4 py-4 space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">
        Gestão de inscrições
      </p>

      {/* Pendentes */}
      {pendingEnrollments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/55">
            Pendentes ({pendingEnrollments.length})
          </p>
          {pendingEnrollments.map((p) => (
            <div key={p.participantId} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2">
              <Avatar name={p.name} url={p.avatarUrl} />
              <span className="min-w-0 flex-1 truncate text-sm text-white/85">{p.name ?? 'Jogador'}</span>
              <button
                type="button"
                onClick={() => onApprove(p.participantId)}
                disabled={busy}
                className="grid h-8 w-8 place-items-center rounded-full bg-cane/20 text-cane transition active:scale-90 disabled:opacity-50"
                title="Aprovar"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onReject(p.participantId)}
                disabled={busy}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/8 text-white/40 transition hover:text-red-400 active:scale-90 disabled:opacity-50"
                title="Recusar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Adicionar jogador */}
      <AddPlayer
        busy={busy}
        excludeIds={[...confirmedUserIds, ...pendingEnrollments.map((p) => p.userId)]}
        onAdd={onAdd}
      />

      {/* Iniciar */}
      <div className="space-y-1.5 border-t border-white/8 pt-3">
        <button
          type="button"
          onClick={onStart}
          disabled={busy || confirmedCount < 2}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cane py-3 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-40"
        >
          <Rocket className="h-4 w-4" />
          Iniciar campeonato
        </button>
        <p className="text-center text-[11px] text-white/35">
          {confirmedCount < 2
            ? 'Confirme ao menos 2 jogadores para iniciar.'
            : `${confirmedCount} jogadores confirmados · inscrições pendentes serão descartadas`}
        </p>
      </div>
    </div>
  )
}

function AddPlayer({
  busy,
  excludeIds,
  onAdd,
}: {
  busy: boolean
  excludeIds: string[]
  onAdd: (userId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [pool, setPool] = useState<Pool[]>([])

  useEffect(() => {
    loadPlayerPool().then((data) =>
      setPool(data.map((p) => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url }))),
    )
  }, [])

  const q = query.trim().toLowerCase()
  const filtered =
    q.length < 2
      ? []
      : pool
          .filter((p) => !excludeIds.includes(p.id) && (p.full_name ?? '').toLowerCase().includes(q))
          .slice(0, 8)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-white/55">Adicionar jogador</p>
      <div className="glass glass-card flex items-center gap-2 px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            <X className="h-4 w-4 text-white/40" />
          </button>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="space-y-1.5">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => { onAdd(p.id); setQuery('') }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2 text-left transition active:scale-[0.98] disabled:opacity-50"
            >
              <Avatar name={p.full_name} url={p.avatar_url} />
              <span className="flex-1 text-sm text-white/85">{p.full_name ?? 'Sem nome'}</span>
              <span className="text-xs font-semibold text-cane">Adicionar</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
