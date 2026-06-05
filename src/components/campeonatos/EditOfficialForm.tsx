'use client'

/**
 * EditOfficialForm — edição de um campeonato oficial enquanto em rascunho
 * (antes do início). Permite alterar metadados (nome, descrição, local, datas),
 * pontuação e a configuração de cada fase. Para grupos_elim, permite mudar o
 * número de grupos (recria os grupos vazios).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Save, Minus, Plus } from 'lucide-react'
import { updateOfficialChampionship, type OfficialStageEdit } from '@/app/(app)/campeonatos/actions'

type Venue = { id: string; name: string }
type StageInput = OfficialStageEdit & { kind: string }

const STAGE_LABEL: Record<string, string> = {
  liga: 'Liga',
  grupos: 'Fase de grupos',
  eliminatoria: 'Eliminatória',
}

function Stepper({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-white/70">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="grid h-7 w-7 place-items-center rounded-full bg-white/8 text-white/60 transition active:scale-90"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-7 text-center text-sm font-bold text-white tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="grid h-7 w-7 place-items-center rounded-full bg-white/8 text-white/60 transition active:scale-90"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between"
    >
      <span className="text-sm text-white/70">{label}</span>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${value ? 'bg-cane' : 'bg-white/20'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

export function EditOfficialForm({
  champ,
  stages,
  venues,
}: {
  champ: {
    id: string
    name: string
    format: string
    description: string | null
    venue_id: string | null
    start_date: string | null
    end_date: string | null
    points_win: number
    points_draw: number
    points_loss: number
    allow_draw: boolean
    has_third_place: boolean
    num_groups: number
  }
  stages: StageInput[]
  venues: Venue[]
}) {
  const router = useRouter()
  const [pending, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(champ.name)
  const [description, setDescription] = useState(champ.description ?? '')
  const [venueId, setVenueId] = useState(champ.venue_id ?? '')
  const [startDate, setStartDate] = useState(champ.start_date ?? '')
  const [endDate, setEndDate] = useState(champ.end_date ?? '')
  const [pointsWin, setPointsWin] = useState(champ.points_win)
  const [pointsDraw, setPointsDraw] = useState(champ.points_draw)
  const [pointsLoss, setPointsLoss] = useState(champ.points_loss)
  const [allowDraw, setAllowDraw] = useState(champ.allow_draw)
  const [hasThirdPlace, setHasThirdPlace] = useState(champ.has_third_place)
  const [numGroups, setNumGroups] = useState(champ.num_groups || 2)
  const [stageState, setStageState] = useState<StageInput[]>(stages)

  const isElim = champ.format === 'eliminatoria'
  const isGrupos = champ.format === 'grupos_elim'
  const isLiga = champ.format === 'liga'

  function patchStage(id: string, patch: Partial<OfficialStageEdit>) {
    setStageState((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function save() {
    setError(null)
    if (!name.trim()) { setError('Informe o nome do campeonato.'); return }
    startSave(async () => {
      const res = await updateOfficialChampionship(champ.id, {
        name,
        description: description.trim() || null,
        venueId: venueId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        pointsWin,
        pointsDraw,
        pointsLoss,
        allowDraw,
        hasThirdPlace,
        numGroups: isGrupos ? numGroups : undefined,
        stages: stageState.map(({ kind: _kind, ...s }) => s),
      })
      if ('error' in res) { setError(res.error); return }
      router.push(`/campeonatos/${champ.id}`)
      router.refresh()
    })
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <Link
        href={`/campeonatos/${champ.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar ao campeonato
      </Link>

      <h1 className="text-lg font-bold text-white">Editar campeonato oficial</h1>

      {/* Metadados */}
      <div className="glass glass-card glass-official px-4 py-4 space-y-3">
        <Field label="Nome">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
            placeholder="Nome do campeonato"
          />
        </Field>
        <Field label="Descrição">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none bg-transparent text-sm text-white placeholder-white/30 outline-none"
            placeholder="Regras, premiação, observações…"
          />
        </Field>
        <Field label="Local">
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className="w-full bg-transparent text-sm text-white outline-none [color-scheme:dark]"
          >
            <option value="" className="bg-primary">Sem local definido</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id} className="bg-primary">{v.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none [color-scheme:dark]"
            />
          </Field>
          <Field label="Término">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none [color-scheme:dark]"
            />
          </Field>
        </div>
      </div>

      {/* Estrutura */}
      {(isElim || isGrupos) && (
        <div className="glass glass-card px-4 py-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">Estrutura</p>
          {isGrupos && (
            <Stepper label="Número de grupos" value={numGroups} min={2} max={8} onChange={setNumGroups} />
          )}
          <Toggle label="Disputa de 3º lugar" value={hasThirdPlace} onChange={setHasThirdPlace} />
        </div>
      )}

      {/* Pontuação (liga / grupos) */}
      {(isLiga || isGrupos) && (
        <div className="glass glass-card px-4 py-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">Pontuação da tabela</p>
          <Stepper label="Vitória" value={pointsWin} min={0} max={10} onChange={setPointsWin} />
          <Toggle label="Permitir empate" value={allowDraw} onChange={setAllowDraw} />
          {allowDraw && (
            <Stepper label="Empate" value={pointsDraw} min={0} max={10} onChange={setPointsDraw} />
          )}
          <Stepper label="Derrota" value={pointsLoss} min={0} max={10} onChange={setPointsLoss} />
        </div>
      )}

      {/* Fases */}
      {stageState.map((s) => (
        <div key={s.id} className="glass glass-card px-4 py-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">
            {STAGE_LABEL[s.kind] ?? s.kind}
          </p>

          {/* Contagem */}
          <div className="flex gap-2">
            {(['set', 'tempo'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patchStage(s.id, { counting: c })}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  s.counting === c ? 'bg-cane text-primary' : 'bg-white/8 text-white/60'
                }`}
              >
                {c === 'set' ? 'Sets' : 'Tempo'}
              </button>
            ))}
          </div>

          {s.counting === 'set' ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Melhor de</span>
                <div className="flex gap-1.5">
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patchStage(s.id, { setsToPlay: n })}
                      className={`h-8 w-9 rounded-lg text-sm font-bold transition ${
                        s.setsToPlay === n ? 'bg-cane text-primary' : 'bg-white/8 text-white/60'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <Stepper label="Pontos por set" value={s.pointsPerSet} min={1} max={30} onChange={(v) => patchStage(s.id, { pointsPerSet: v })} />
              <Toggle label="Vantagem de 2" value={s.winByTwo} onChange={(v) => patchStage(s.id, { winByTwo: v })} />
            </>
          ) : (
            <Stepper label="Minutos" value={s.timeMinutes ?? 10} min={1} max={60} onChange={(v) => patchStage(s.id, { timeMinutes: v })} />
          )}

          {(s.kind === 'liga' || s.kind === 'grupos') && (
            <Stepper label="Rodadas (turnos)" value={s.rounds} min={1} max={4} onChange={(v) => patchStage(s.id, { rounds: v })} />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-400/90">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cane py-3.5 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {pending ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{label}</p>
      {children}
    </div>
  )
}
