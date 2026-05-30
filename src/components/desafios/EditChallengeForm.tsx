'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Save } from 'lucide-react'
import { updateChallengeSettings } from '@/app/(app)/campeonatos/manage-actions'

interface Props {
  challenge: { id: string; name: string; status: string }
  stageId: string | null
  rounds: number
}

export function EditChallengeForm({ challenge, stageId, rounds: initialRounds }: Props) {
  const router = useRouter()
  const draft = challenge.status === 'rascunho'
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(challenge.name)
  const [rounds, setRounds] = useState(initialRounds)

  function submit() {
    if (!name.trim()) { setError('Informe um nome.'); return }
    setError(null)
    startTransition(async () => {
      const result = await updateChallengeSettings({
        id: challenge.id,
        name,
        draft,
        ...(draft && { stageId, rounds }),
      })
      if (result.error) { setError(result.error); return }
      router.push(`/desafios/${challenge.id}`)
    })
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <Link
        href={`/desafios/${challenge.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <h1 className="font-display text-xl font-extrabold text-white">Editar desafio</h1>

      {!draft && (
        <p className="rounded-2xl bg-yellow-500/10 px-4 py-3 text-xs text-yellow-200/80">
          Desafio já aceito/em andamento: apenas o nome pode ser alterado.
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-white/55">Nome</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none placeholder-white/30"
          placeholder="Nome do desafio"
        />
      </label>

      {draft && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-white/55">Número de partidas (melhor de)</span>
          <div className="flex gap-2">
            {[1, 3, 5, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRounds(n)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                  rounds === n ? 'bg-secondary text-primary' : 'bg-white/[0.06] text-white/60'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </label>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {pending ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  )
}
