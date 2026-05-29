'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, AlertTriangle, X } from 'lucide-react'
import { deleteChampionship } from '@/app/(app)/campeonatos/manage-actions'

interface Props {
  id: string
  /** base da rota de edição, ex.: '/campeonatos' ou '/desafios' */
  basePath: string
  /** para onde voltar após excluir, ex.: '/campeonatos' ou '/jogos' */
  listPath: string
}

export function ManageBar({ id, basePath, listPath }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteChampionship(id)
        router.push(listPath)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao excluir.')
      }
    })
  }

  if (confirming) {
    return (
      <div className="glass glass-card flex flex-col gap-3 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-white/80">
            Excluir definitivamente? Partidas, participantes e dados relacionados serão removidos.
          </p>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="flex-1 rounded-xl bg-red-500/90 px-4 py-2.5 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
          >
            {pending ? 'Excluindo…' : 'Sim, excluir'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white/70 transition active:scale-95"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Link
        href={`${basePath}/${id}/editar`}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white/75 transition active:scale-95 hover:bg-white/[0.1]"
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </Link>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 px-4 py-2.5 text-xs font-semibold text-red-300 transition active:scale-95 hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir
      </button>
    </div>
  )
}
