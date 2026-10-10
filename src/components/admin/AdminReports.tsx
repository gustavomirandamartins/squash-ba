'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, Trash2, UserRound, XCircle } from 'lucide-react'
import { resolveReport } from '@/app/admin/actions'
import { REASON_LABEL, TARGET_LABEL, type ReportReason, type ReportTarget } from '@/lib/moderation'

export type AdminReport = {
  id: string
  target_type: ReportTarget
  target_id: string
  reason: ReportReason
  details: string | null
  status: 'aberta' | 'resolvida' | 'descartada'
  created_at: string
  resolved_at: string | null
  reporter_id: string
  reporter_name: string | null
  target_user_id: string | null
  target_user_name: string | null
  preview: string | null
  target_exists: boolean
  open_on_target: number
}

const STATUS_STYLE: Record<AdminReport['status'], string> = {
  aberta: 'bg-yellow-500/15 text-yellow-400',
  resolvida: 'bg-secondary/15 text-secondary',
  descartada: 'bg-white/8 text-white/45',
}

export function AdminReports({ reports }: { reports: AdminReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="glass glass-card px-4 py-10 text-center text-sm text-white/35">
        Nenhuma denúncia por enquanto.
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {reports.map((r) => (
        <ReportItem key={r.id} report={r} />
      ))}
    </ul>
  )
}

function ReportItem({ report: r }: { report: AdminReport }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const isOpen = r.status === 'aberta'
  const canRemove = isOpen && r.target_exists && r.target_type !== 'profile'

  function run(action: 'remover' | 'descartar') {
    startTransition(async () => {
      setError(null)
      const res = await resolveReport(r.id, action)
      if (res.error) setError(res.error)
      setConfirmRemove(false)
    })
  }

  const when = (() => {
    try {
      return formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })
    } catch {
      return ''
    }
  })()

  return (
    <li className={`glass glass-card space-y-3 px-4 py-4 ${isOpen ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
          {r.status === 'aberta' ? 'Aberta' : r.status === 'resolvida' ? 'Resolvida' : 'Descartada'}
        </span>
        <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[11px] font-semibold text-white/65">
          {TARGET_LABEL[r.target_type]}
        </span>
        <span className="text-[11px] font-semibold text-white/70">{REASON_LABEL[r.reason]}</span>
        <span className="ml-auto text-[11px] text-white/30">{when}</span>
      </div>

      <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
        <p className="text-[11px] text-white/40">
          {r.target_user_name ?? 'Usuário'}
          {!r.target_exists && ' · conteúdo já removido'}
        </p>
        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-sm text-white/80">
          {r.preview ?? '—'}
        </p>
      </div>

      {r.details && (
        <p className="text-xs leading-relaxed text-white/55">
          <span className="text-white/35">Detalhes: </span>
          {r.details}
        </p>
      )}
      <p className="text-[11px] text-white/35">
        Denunciado por {r.reporter_name ?? 'usuário'}
        {r.open_on_target > 1 && ` · ${r.open_on_target} denúncias abertas para este conteúdo`}
      </p>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {canRemove &&
          (confirmRemove ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run('remover')}
                className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3.5 py-1.5 text-xs font-bold text-red-400 transition active:scale-95 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Confirmar remoção
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmRemove(false)}
                className="rounded-full bg-white/8 px-3.5 py-1.5 text-xs font-semibold text-white/60"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-red-400 transition active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover conteúdo
            </button>
          ))}
        {isOpen && !confirmRemove && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('descartar')}
            className="flex items-center gap-1.5 rounded-full bg-white/8 px-3.5 py-1.5 text-xs font-semibold text-white/65 transition active:scale-95 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Descartar
          </button>
        )}
        {r.target_user_id && (
          <Link
            href={`/admin/usuarios?u=${r.target_user_id}`}
            className="flex items-center gap-1.5 rounded-full bg-white/8 px-3.5 py-1.5 text-xs font-semibold text-white/65 transition active:scale-95"
          >
            <UserRound className="h-3.5 w-3.5" />
            Ir para o usuário
          </Link>
        )}
      </div>
    </li>
  )
}
