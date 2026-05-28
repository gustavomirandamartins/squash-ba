'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  Search,
  AlertCircle,
  Swords,
  Users,
  User,
} from 'lucide-react'
import { createDesafio1v1, type ChallengeConfig } from '@/app/(app)/desafios/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChallengeType = '1v1' | 'teams'

interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

interface WizardState extends ChallengeConfig {
  type: ChallengeType | null
  opponent: Profile | null
}

type Patch = Partial<WizardState>

// ─── Constants ────────────────────────────────────────────────────────────────

const TIEBREAKER_LABELS: Record<string, string> = {
  sets_ganhos: 'Sets ganhos',
  pontos_ganhos: 'Pontos ganhos',
  pontos_sofridos_asc: 'Menos pontos sofridos',
}

const DEFAULT: WizardState = {
  type: null,
  name: '',
  rounds: 1,
  counting: 'set',
  setsToPlay: 3,
  pointsPerSet: 11,
  winByTwo: true,
  setDrawEnabled: false,
  timeMinutes: null,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['sets_ganhos', 'pontos_ganhos', 'pontos_sofridos_asc'],
  opponent: null,
}

const STEP_TITLES = ['Tipo de desafio', 'Configuração', 'Revisão']

// ─── Shared sub-components ────────────────────────────────────────────────────

function PlayerAvatar({ profile, size = 32 }: { profile: Profile; size?: number }) {
  if (profile.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt={profile.full_name ?? ''}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-secondary/20 grid place-items-center text-xs font-bold text-secondary shrink-0"
      style={{ width: size, height: size }}
    >
      {(profile.full_name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-white/65">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
          value ? 'bg-secondary text-primary' : 'bg-white/10 text-white/50'
        }`}
      >
        {value ? 'Sim' : 'Não'}
      </button>
    </div>
  )
}

function NumberField({
  label, value, onChange, min = 0, max = 99,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-white/65">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-7 w-7 rounded-full bg-white/10 text-white/60 grid place-items-center transition active:scale-95"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold text-white">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-7 w-7 rounded-full bg-white/10 text-white/60 grid place-items-center transition active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-white/40 shrink-0">{label}</span>
      <span className="text-xs text-white/80 text-right">{value}</span>
    </div>
  )
}

// ─── Step 1: Tipo ─────────────────────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (type: ChallengeType) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/45 px-1 text-center">
        Escolha o tipo de desafio para começar
      </p>

      <button
        type="button"
        onClick={() => onSelect('1v1')}
        className="glass glass-card w-full flex items-start gap-4 px-5 py-5 text-left transition active:scale-[0.97] hover:border-secondary/30"
      >
        <div className="h-11 w-11 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
          <Swords className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-white">Desafio 1v1</p>
          <p className="text-sm text-white/45 mt-0.5 leading-snug">
            Dois jogadores, N partidas. O oponente recebe um convite para aceitar.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-white/25 shrink-0 mt-0.5" />
      </button>

      <button
        type="button"
        onClick={() => onSelect('teams')}
        className="glass glass-card w-full flex items-start gap-4 px-5 py-5 text-left transition active:scale-[0.97] hover:border-secondary/30 opacity-60"
      >
        <div className="h-11 w-11 rounded-2xl bg-white/8 grid place-items-center shrink-0">
          <Users className="h-5 w-5 text-white/40" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-white/70">Desafio por Times</p>
          <p className="text-sm text-white/35 mt-0.5 leading-snug">
            Times se enfrentam. Classificação dupla (individual + equipe).
          </p>
          <span className="inline-block mt-1.5 rounded-full bg-white/8 px-2.5 py-0.5 text-[10px] font-semibold text-white/35 uppercase tracking-wide">
            Em breve
          </span>
        </div>
        <ChevronRight className="h-5 w-5 text-white/15 shrink-0 mt-0.5" />
      </button>
    </div>
  )
}

// ─── Step 2: Configuração 1v1 ─────────────────────────────────────────────────

function Step2_1v1({
  state,
  onChange,
  currentUserId,
}: {
  state: WizardState
  onChange: (p: Patch) => void
  currentUserId: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)
  const allowDraw = state.counting === 'tempo' || state.setDrawEnabled

  // Debounced opponent search
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim() || query.trim().length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      const { data } = await createClient()
        .from('profiles')
        .select('id, full_name, avatar_url')
        .ilike('full_name', `%${query.trim()}%`)
        .neq('id', currentUserId)
        .order('full_name')
        .limit(10)
      setResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, currentUserId])

  function moveTiebreaker(idx: number, dir: -1 | 1) {
    const arr = [...state.tiebreakers]
    const target = idx + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
    onChange({ tiebreakers: arr })
  }

  return (
    <div className="space-y-4">
      {/* Nome */}
      <div className="glass glass-card px-4 py-3.5 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Nome do desafio
        </p>
        <input
          autoFocus
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ex.: Desafio Gustavo × Pedro"
          className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
      </div>

      {/* Partidas */}
      <div className="glass glass-card px-4 py-4 space-y-3">
        <NumberField
          label="Número de partidas"
          value={state.rounds}
          onChange={(v) => onChange({ rounds: v })}
          min={1}
          max={20}
        />
        <p className="text-xs text-white/35 leading-relaxed">
          {state.rounds === 1
            ? 'Melhor de 1 partida.'
            : `Melhor de ${state.rounds} partidas — vence quem ganhar mais.`}
        </p>
      </div>

      {/* Sistema de contagem */}
      <div className="glass glass-card px-4 py-4 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Sistema de contagem
        </p>
        <div className="flex gap-2">
          {(['set', 'tempo'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ counting: c })}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 ${
                state.counting === c
                  ? 'border-secondary/50 bg-secondary/15 text-secondary'
                  : 'border-white/10 bg-white/5 text-white/50'
              }`}
            >
              {c === 'set' ? 'Por set' : 'Por tempo'}
            </button>
          ))}
        </div>

        {state.counting === 'set' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-white/65">Formato</span>
              <div className="flex gap-1.5">
                {([1, 3, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onChange({ setsToPlay: n })}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
                      state.setsToPlay === n
                        ? 'bg-secondary text-primary'
                        : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {n === 1 ? '1 set' : `MD${n}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-px bg-white/8" />
            <NumberField
              label="Pontos por set"
              value={state.pointsPerSet}
              onChange={(v) => onChange({ pointsPerSet: v })}
              min={3}
              max={21}
            />
            <Toggle label="Vencer por 2 pontos" value={state.winByTwo} onChange={(v) => onChange({ winByTwo: v })} />
            <Toggle
              label={`Empate em ${state.pointsPerSet}×${state.pointsPerSet}`}
              value={state.setDrawEnabled}
              onChange={(v) => onChange({ setDrawEnabled: v })}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-white/65">Duração (minutos)</span>
            <input
              type="number"
              min={1}
              max={180}
              value={state.timeMinutes ?? ''}
              onChange={(e) => onChange({ timeMinutes: e.target.value ? Number(e.target.value) : null })}
              placeholder="Ex.: 30"
              className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-center text-sm text-white outline-none placeholder-white/30"
            />
          </div>
        )}
      </div>

      {/* Pontuação da tabela */}
      <div className="glass glass-card px-4 py-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Pontuação da tabela
        </p>
        <NumberField label="Vitória" value={state.pointsWin} onChange={(v) => onChange({ pointsWin: v })} min={0} max={9} />
        {allowDraw && (
          <NumberField label="Empate" value={state.pointsDraw} onChange={(v) => onChange({ pointsDraw: v })} min={0} max={9} />
        )}
        <NumberField label="Derrota" value={state.pointsLoss} onChange={(v) => onChange({ pointsLoss: v })} min={0} max={9} />
      </div>

      {/* Desempate */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
          Desempate (ordem de prioridade)
        </p>
        {state.tiebreakers.map((key, i) => (
          <div key={key} className="glass glass-card flex items-center gap-3 px-3.5 py-3">
            <span className="text-xs font-bold text-secondary w-4 shrink-0 text-center">{i + 1}</span>
            <span className="flex-1 text-sm text-white/80">{TIEBREAKER_LABELS[key]}</span>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => moveTiebreaker(i, -1)}
                className="h-5 w-5 grid place-items-center rounded text-white/40 hover:text-white/70 disabled:opacity-20 transition"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={i === state.tiebreakers.length - 1}
                onClick={() => moveTiebreaker(i, 1)}
                className="h-5 w-5 grid place-items-center rounded text-white/40 hover:text-white/70 disabled:opacity-20 transition"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Oponente */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
          Oponente
        </p>

        {state.opponent ? (
          <div className="glass glass-card flex items-center gap-3 px-4 py-3">
            <PlayerAvatar profile={state.opponent} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {state.opponent.full_name ?? 'Sem nome'}
              </p>
              <p className="text-xs text-secondary/70">Oponente selecionado</p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ opponent: null })}
              className="h-7 w-7 grid place-items-center rounded-full text-white/30 hover:bg-white/8 hover:text-red-400 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="glass glass-card flex items-center gap-2 px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar jogador por nome…"
                className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')}>
                  <X className="h-4 w-4 text-white/40" />
                </button>
              )}
            </div>

            {searching && (
              <p className="text-center text-xs text-white/35 py-3">Buscando…</p>
            )}

            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-center text-xs text-white/35 py-3">
                Nenhum jogador encontrado para &ldquo;{query}&rdquo;.
              </p>
            )}

            {!searching && results.length > 0 && (
              <div className="space-y-1.5">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange({ opponent: p }); setQuery(''); setResults([]) }}
                    className="glass glass-card w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition active:scale-[0.98]"
                  >
                    <PlayerAvatar profile={p} size={32} />
                    <span className="flex-1 text-sm text-white/85">{p.full_name ?? 'Sem nome'}</span>
                    <span className="text-xs font-semibold text-secondary/80">Desafiar</span>
                  </button>
                ))}
              </div>
            )}

            {!query.trim() && (
              <p className="text-center text-xs text-white/25 py-2">
                Digite pelo menos 2 letras para buscar.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Step 3: Revisão ──────────────────────────────────────────────────────────

function Step3({
  state,
  onSubmit,
  isPending,
  error,
}: {
  state: WizardState
  onSubmit: () => void
  isPending: boolean
  error: string | null
}) {
  const allowDraw = state.counting === 'tempo' || state.setDrawEnabled

  const countingDesc =
    state.counting === 'set'
      ? `Por set — ${state.setsToPlay === 1 ? '1 set' : `MD${state.setsToPlay}`}, ${state.pointsPerSet} pts/set`
      : `Por tempo — ${state.timeMinutes} min`

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="glass glass-card px-4 py-4 space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-3">
          Resumo do desafio
        </p>
        <SummaryRow label="Nome" value={state.name} />
        <SummaryRow label="Tipo" value="Desafio 1v1" />
        <div className="h-px bg-white/8" />
        <SummaryRow label="Partidas" value={`${state.rounds} ${state.rounds === 1 ? 'partida' : 'partidas'}`} />
        <SummaryRow label="Contagem" value={countingDesc} />
        <SummaryRow
          label="Pontuação"
          value={`V ${state.pointsWin} · ${allowDraw ? `E ${state.pointsDraw} · ` : ''}D ${state.pointsLoss}`}
        />
        <div className="h-px bg-white/8" />
        {state.opponent && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-white/40 shrink-0">Oponente</span>
            <div className="flex items-center gap-2">
              <PlayerAvatar profile={state.opponent} size={22} />
              <span className="text-xs text-white/80 truncate max-w-[150px]">
                {state.opponent.full_name ?? 'Sem nome'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="glass glass-card px-4 py-3.5 flex items-start gap-3">
        <div className="h-5 w-5 rounded-full bg-secondary/20 grid place-items-center shrink-0 mt-0.5">
          <span className="text-[10px] font-bold text-secondary">!</span>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          O oponente receberá um convite. O desafio só começa após a aceitação.
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending}
        className="w-full rounded-full bg-secondary py-3.5 text-base font-bold text-primary transition active:scale-[0.98] disabled:opacity-50"
      >
        {isPending ? 'Criando desafio…' : 'Criar desafio'}
      </button>
    </div>
  )
}

// ─── canAdvance ───────────────────────────────────────────────────────────────

function canAdvance(step: number, s: WizardState): boolean {
  if (step === 1) return s.type !== null
  if (step === 2) {
    if (!s.name.trim()) return false
    if (s.counting === 'tempo' && !s.timeMinutes) return false
    if (s.type === '1v1') return s.opponent !== null
    return true // teams stub
  }
  return true
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface Props {
  currentUserId: string
}

export function ChallengeWizard({ currentUserId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(DEFAULT)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onChange(patch: Patch) {
    setState((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  function handleTypeSelect(type: ChallengeType) {
    onChange({ type })
    setStep(2) // auto-avança
  }

  function next() {
    if (canAdvance(step, state)) setStep((s) => Math.min(3, s + 1))
  }

  function back() {
    if (step > 1) setStep((s) => s - 1)
    else router.push('/jogos')
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        if (state.type === '1v1') {
          if (!state.opponent) { setError('Selecione um oponente.'); return }
          const result = await createDesafio1v1(
            {
              name: state.name,
              rounds: state.rounds,
              counting: state.counting,
              setsToPlay: state.setsToPlay,
              pointsPerSet: state.pointsPerSet,
              winByTwo: state.winByTwo,
              setDrawEnabled: state.setDrawEnabled,
              timeMinutes: state.timeMinutes,
              pointsWin: state.pointsWin,
              pointsDraw: state.pointsDraw,
              pointsLoss: state.pointsLoss,
              tiebreakers: state.tiebreakers,
            },
            state.opponent.id,
          )
          if ('error' in result) { setError(result.error); return }
          router.push(`/desafios/${result.id}`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar desafio.')
      }
    })
  }

  const canGoForward = canAdvance(step, state)

  return (
    <div>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 space-y-3">
        <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
          <button
            type="button"
            onClick={back}
            className="h-8 w-8 grid place-items-center rounded-full bg-white/8 text-white/60 transition active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-[11px] text-white/40">Passo {step} de 3</p>
            <p className="text-base font-semibold text-white">{STEP_TITLES[step - 1]}</p>
          </div>
          {step === 1 ? (
            <Link
              href="/jogos"
              className="h-8 w-8 grid place-items-center rounded-full bg-white/8 text-white/40 transition active:scale-95"
            >
              <X className="h-4 w-4" />
            </Link>
          ) : (
            <div />
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-secondary transition-all duration-300 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-6 space-y-0">
        {step === 1 && <Step1 onSelect={handleTypeSelect} />}
        {step === 2 && state.type === '1v1' && (
          <Step2_1v1 state={state} onChange={onChange} currentUserId={currentUserId} />
        )}
        {step === 3 && (
          <Step3 state={state} onSubmit={handleSubmit} isPending={isPending} error={error} />
        )}

        {/* Avançar (só no step 2; step 1 auto-avança, step 3 tem botão próprio) */}
        {step === 2 && (
          <div className="pt-5">
            <button
              type="button"
              onClick={next}
              disabled={!canGoForward}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-secondary py-3.5 text-base font-bold text-primary transition active:scale-[0.98] disabled:opacity-35"
            >
              Revisar
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
