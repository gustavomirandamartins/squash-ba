'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Save } from 'lucide-react'
import { updateChampionshipSettings } from '@/app/(app)/campeonatos/manage-actions'

interface Props {
  champ: {
    id: string
    name: string
    status: string
    allow_draw: boolean
    points_win: number
    points_draw: number
    points_loss: number
  }
  stage: { id: string; sets_to_play: number; points_per_set: number; win_by_two: boolean } | null
}

export function EditChampionshipForm({ champ, stage }: Props) {
  const router = useRouter()
  const draft = champ.status === 'rascunho'
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(champ.name)
  const [pointsWin, setPointsWin] = useState(champ.points_win)
  const [pointsDraw, setPointsDraw] = useState(champ.points_draw)
  const [pointsLoss, setPointsLoss] = useState(champ.points_loss)
  const [setsToPlay, setSetsToPlay] = useState(stage?.sets_to_play ?? 3)
  const [pointsPerSet, setPointsPerSet] = useState(stage?.points_per_set ?? 11)
  const [winByTwo, setWinByTwo] = useState(stage?.win_by_two ?? true)

  function submit() {
    if (!name.trim()) { setError('Informe um nome.'); return }
    setError(null)
    startTransition(async () => {
      const result = await updateChampionshipSettings({
        id: champ.id,
        name,
        draft,
        ...(draft && {
          pointsWin,
          pointsDraw: champ.allow_draw ? pointsDraw : 0,
          pointsLoss,
          stageId: stage?.id ?? null,
          setsToPlay,
          pointsPerSet,
          winByTwo,
        }),
      })
      if (result.error) { setError(result.error); return }
      router.push(`/campeonatos/${champ.id}`)
    })
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <Link
        href={`/campeonatos/${champ.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <h1 className="font-display text-xl font-extrabold text-white">Editar campeonato</h1>

      {!draft && (
        <p className="rounded-2xl bg-yellow-500/10 px-4 py-3 text-xs text-yellow-200/80">
          Campeonato em andamento: apenas o nome pode ser alterado. Para mudar configurações, exclua e crie novamente.
        </p>
      )}

      <Field label="Nome">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none placeholder-white/30"
          placeholder="Nome do campeonato"
        />
      </Field>

      {draft && (
        <>
          <div className="pt-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">Pontuação</div>
          <div className="grid grid-cols-3 gap-2">
            <NumField label="Vitória" value={pointsWin} onChange={setPointsWin} />
            <NumField label="Empate" value={pointsDraw} onChange={setPointsDraw} disabled={!champ.allow_draw} />
            <NumField label="Derrota" value={pointsLoss} onChange={setPointsLoss} />
          </div>

          {stage && (
            <>
              <div className="pt-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">Partidas</div>
              <Field label="Sets por partida">
                <div className="flex gap-2">
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSetsToPlay(n)}
                      className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                        setsToPlay === n ? 'bg-secondary text-primary' : 'bg-white/[0.06] text-white/60'
                      }`}
                    >
                      {n === 1 ? '1 set' : `MD${n}`}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Pontos por set" value={pointsPerSet} onChange={setPointsPerSet} />
                <Field label="Vantagem de 2">
                  <button
                    type="button"
                    onClick={() => setWinByTwo((v) => !v)}
                    className={`w-full rounded-xl py-2.5 text-sm font-semibold transition ${
                      winByTwo ? 'bg-secondary text-primary' : 'bg-white/[0.06] text-white/60'
                    }`}
                  >
                    {winByTwo ? 'Sim' : 'Não'}
                  </button>
                </Field>
              </div>
            </>
          )}
        </>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-white/55">{label}</span>
      {children}
    </label>
  )
}

function NumField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none disabled:opacity-40"
      />
    </Field>
  )
}
