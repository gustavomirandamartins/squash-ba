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
  Info,
  Trophy,
  Layers,
  GitMerge,
  Swords,
  User,
  Users,
  Users2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Format = 'liga' | 'grupos_elim' | 'eliminatoria' | 'desafio'
type Unit = 'player' | 'pair' | 'team'
type Counting = 'set' | 'tempo'

interface PlayerResult {
  id: string
  full_name: string | null
  avatar_url: string | null
}

interface WizardState {
  // Step 1
  name: string
  format: Format
  unit: Unit
  // Step 2
  rounds: number
  // Step 3
  counting: Counting
  setsToPlay: 1 | 3 | 5
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: string
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  tiebreakers: string[]
  // Step 4
  players: PlayerResult[]
  // Step 5
  status: 'rascunho' | 'ativo'
}

type Patch = Partial<WizardState>

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: Format; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'liga',
    label: 'Liga',
    desc: 'Todos jogam entre si. Classificação por pontos.',
    icon: <Trophy className="h-5 w-5" />,
  },
  {
    value: 'grupos_elim',
    label: 'Grupos + Elim.',
    desc: 'Fase de grupos seguida de eliminatórias.',
    icon: <Layers className="h-5 w-5" />,
  },
  {
    value: 'eliminatoria',
    label: 'Eliminatórias',
    desc: 'Chaveamento direto. Quem perde, sai.',
    icon: <GitMerge className="h-5 w-5" />,
  },
  {
    value: 'desafio',
    label: 'Desafio',
    desc: 'Confrontos avulsos livres.',
    icon: <Swords className="h-5 w-5" />,
  },
]

const UNIT_OPTIONS: { value: Unit; label: string; sub: string; icon: React.ReactNode }[] = [
  { value: 'player', label: 'Jogador', sub: '1 vs 1', icon: <User className="h-5 w-5" /> },
  { value: 'pair', label: 'Dupla', sub: '2 vs 2', icon: <Users className="h-5 w-5" /> },
  { value: 'team', label: 'Time', sub: 'N vs N', icon: <Users2 className="h-5 w-5" /> },
]

const TIEBREAKER_LABELS: Record<string, string> = {
  sets_ganhos: 'Sets ganhos',
  pontos_ganhos: 'Pontos ganhos',
  pontos_sofridos_asc: 'Menos pontos sofridos',
}

const FORMAT_LABEL: Record<Format, string> = {
  liga: 'Liga',
  grupos_elim: 'Grupos + Eliminatórias',
  eliminatoria: 'Eliminatórias',
  desafio: 'Desafio',
}

const UNIT_LABEL: Record<Unit, string> = {
  player: 'Jogador (1v1)',
  pair: 'Dupla (2v2)',
  team: 'Time',
}

const STEP_TITLES = [
  'Dados básicos',
  'Configuração da liga',
  'Contagem e pontuação',
  'Participantes',
  'Revisão',
]

const DEFAULT_STATE: WizardState = {
  name: '',
  format: 'liga',
  unit: 'player',
  rounds: 1,
  counting: 'set',
  setsToPlay: 3,
  pointsPerSet: 11,
  winByTwo: true,
  setDrawEnabled: false,
  timeMinutes: '',
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['sets_ganhos', 'pontos_ganhos', 'pontos_sofridos_asc'],
  players: [],
  status: 'rascunho',
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function PlayerAvatar({ player, size = 36 }: { player: PlayerResult; size?: number }) {
  if (player.avatar_url) {
    return (
      <Image
        src={player.avatar_url}
        alt={player.full_name ?? ''}
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
      {(player.full_name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean
  onChange: (v: boolean) => void
  label: string
}) {
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
  label,
  value,
  onChange,
  min = 0,
  max = 999,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-white/65">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-7 w-7 rounded-full bg-white/10 text-white/60 grid place-items-center text-base leading-none transition active:scale-95"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold text-white">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-7 w-7 rounded-full bg-white/10 text-white/60 grid place-items-center text-base leading-none transition active:scale-95"
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

function ComingSoonBanner() {
  return (
    <div
      className="glass glass-card flex items-start gap-3 px-4 py-3"
      style={{ borderColor: 'rgba(205,253,81,0.25)' }}
    >
      <Info className="h-4 w-4 shrink-0 text-secondary mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-white/90">
          Configuração disponível em breve
        </p>
        <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
          Por enquanto, apenas <strong className="text-white/70">Liga</strong> com
          unidade <strong className="text-white/70">Jogador</strong> está disponível
          para configuração completa.
        </p>
      </div>
    </div>
  )
}

// ─── canAdvance ───────────────────────────────────────────────────────────────

function canAdvance(step: number, s: WizardState): boolean {
  if (step === 1)
    return s.name.trim() !== '' && s.format === 'liga' && s.unit === 'player'
  if (step === 2) return s.rounds >= 1
  if (step === 3) {
    if (s.counting === 'tempo')
      return s.timeMinutes !== '' && Number(s.timeMinutes) > 0
    return true
  }
  if (step === 4) return s.players.length >= 2
  return true
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const blocked = state.format !== 'liga' || state.unit !== 'player'

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="glass glass-card px-4 py-3.5 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Nome do campeonato
        </p>
        <input
          autoFocus
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ex.: Liga Baiana 2026"
          className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
      </div>

      {/* Format */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
          Formato
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FORMAT_OPTIONS.map((f) => {
            const active = state.format === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onChange({ format: f.value })}
                className={`glass glass-card flex flex-col items-start gap-1.5 px-3 py-3 text-left transition active:scale-[0.97] ${
                  active ? 'border-secondary/50 bg-secondary/10' : ''
                }`}
              >
                <span className={active ? 'text-secondary' : 'text-white/40'}>
                  {f.icon}
                </span>
                <span className="text-sm font-semibold text-white/90 leading-snug">
                  {f.label}
                </span>
                <span className="text-[11px] text-white/40 leading-snug">{f.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Unit */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
          Unidade de confronto
        </p>
        <div className="flex gap-2">
          {UNIT_OPTIONS.map((u) => {
            const active = state.unit === u.value
            return (
              <button
                key={u.value}
                type="button"
                onClick={() => onChange({ unit: u.value })}
                className={`glass glass-card flex flex-1 flex-col items-center gap-1 py-3 transition active:scale-[0.97] ${
                  active ? 'border-secondary/50 bg-secondary/10' : ''
                }`}
              >
                <span className={active ? 'text-secondary' : 'text-white/40'}>
                  {u.icon}
                </span>
                <span className="text-xs font-semibold text-white/90">{u.label}</span>
                <span className="text-[10px] text-white/40">{u.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {blocked && <ComingSoonBanner />}
    </div>
  )
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function Step2({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  return (
    <div className="space-y-4">
      <div className="glass glass-card px-4 py-4 space-y-4">
        <NumberField
          label="Número de rodadas"
          value={state.rounds}
          onChange={(v) => onChange({ rounds: v })}
          min={1}
          max={10}
        />
      </div>

      <div className="glass glass-card px-4 py-3.5 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          O que é round-robin?
        </p>
        <p className="text-sm text-white/55 leading-relaxed">
          Cada participante enfrenta todos os outros. Com{' '}
          <strong className="text-white/80">
            {state.rounds === 1 ? 'turno único' : `${state.rounds} rodadas`}
          </strong>
          , cada confronto acontece{' '}
          <strong className="text-white/80">
            {state.rounds === 1 ? 'uma vez' : `${state.rounds} vezes`}
          </strong>
          .{state.rounds === 2 && ' (turno e returno)'}
          {state.rounds > 2 && ` (${state.rounds} turnos)`}
        </p>
      </div>
    </div>
  )
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

function Step3({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const allowDraw = state.counting === 'tempo' || state.setDrawEnabled

  function moveTiebreaker(idx: number, dir: -1 | 1) {
    const arr = [...state.tiebreakers]
    const target = idx + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
    onChange({ tiebreakers: arr })
  }

  return (
    <div className="space-y-4">
      {/* Counting system */}
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
            {/* Sets format */}
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
            <Toggle
              label="Vencer por 2 pontos"
              value={state.winByTwo}
              onChange={(v) => onChange({ winByTwo: v })}
            />
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
              value={state.timeMinutes}
              onChange={(e) => onChange({ timeMinutes: e.target.value })}
              placeholder="Ex.: 30"
              className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-center text-sm text-white outline-none placeholder-white/30"
            />
          </div>
        )}
      </div>

      {/* Table scoring */}
      <div className="glass glass-card px-4 py-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Pontuação da tabela
        </p>
        <NumberField
          label="Vitória"
          value={state.pointsWin}
          onChange={(v) => onChange({ pointsWin: v })}
          min={0}
          max={9}
        />
        {allowDraw && (
          <NumberField
            label="Empate"
            value={state.pointsDraw}
            onChange={(v) => onChange({ pointsDraw: v })}
            min={0}
            max={9}
          />
        )}
        <NumberField
          label="Derrota"
          value={state.pointsLoss}
          onChange={(v) => onChange({ pointsLoss: v })}
          min={0}
          max={9}
        />
      </div>

      {/* Tiebreakers */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
          Desempate (ordem de prioridade)
        </p>
        {state.tiebreakers.map((key, i) => (
          <div key={key} className="glass glass-card flex items-center gap-3 px-3.5 py-3">
            <span className="text-xs font-bold text-secondary w-4 shrink-0 text-center">
              {i + 1}
            </span>
            <span className="flex-1 text-sm text-white/80">
              {TIEBREAKER_LABELS[key]}
            </span>
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
    </div>
  )
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────

function Step4({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .ilike('full_name', `%${q}%`)
        .limit(8)
      const filtered = (data ?? []).filter(
        (p) => !state.players.find((s) => s.id === p.id),
      )
      setResults(filtered)
      setSearching(false)
    }, 280)
    return () => clearTimeout(t)
  }, [query, state.players])

  function addPlayer(p: PlayerResult) {
    onChange({ players: [...state.players, p] })
    setQuery('')
    setResults([])
  }

  function removePlayer(id: string) {
    onChange({ players: state.players.filter((p) => p.id !== id) })
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="glass glass-card flex items-center gap-2 px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jogador por nome…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults([])
            }}
          >
            <X className="h-4 w-4 text-white/40" />
          </button>
        )}
      </div>

      {/* Results panel — visible whenever query has ≥2 chars */}
      {query.trim().length >= 2 && (
        <div className="space-y-1.5">
          {searching ? (
            <p className="text-xs text-white/40 px-1">Buscando…</p>
          ) : results.length > 0 ? (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addPlayer(p)}
                className="glass glass-card w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition active:scale-[0.98]"
              >
                <PlayerAvatar player={p} size={32} />
                <span className="flex-1 text-sm text-white/85">
                  {p.full_name ?? 'Sem nome'}
                </span>
                <span className="text-xs font-semibold text-secondary">+ Adicionar</span>
              </button>
            ))
          ) : (
            <p className="text-xs text-white/40 px-1">
              Nenhum resultado para &quot;{query.trim()}&quot;.
            </p>
          )}
        </div>
      )}

      {/* Selected list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Selecionados
          </p>
          <span
            className={`text-xs font-semibold ${
              state.players.length < 2 ? 'text-white/30' : 'text-secondary'
            }`}
          >
            {state.players.length}{' '}
            {state.players.length === 1 ? 'jogador' : 'jogadores'}
            {state.players.length < 2 && ' (mín. 2)'}
          </span>
        </div>

        {state.players.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/30">
            Nenhum jogador adicionado ainda.
          </p>
        ) : (
          state.players.map((p) => (
            <div
              key={p.id}
              className="glass glass-card flex items-center gap-3 px-3.5 py-2.5"
            >
              <PlayerAvatar player={p} size={32} />
              <span className="flex-1 text-sm text-white/85">
                {p.full_name ?? 'Sem nome'}
              </span>
              <button
                type="button"
                onClick={() => removePlayer(p.id)}
                className="h-7 w-7 grid place-items-center rounded-full text-white/30 hover:bg-white/8 hover:text-red-400 transition active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Step 5 ───────────────────────────────────────────────────────────────────

function Step5({
  state,
  onChange,
  onSubmit,
  isPending,
  error,
}: {
  state: WizardState
  onChange: (p: Patch) => void
  onSubmit: () => void
  isPending: boolean
  error: string | null
}) {
  const allowDraw =
    state.counting === 'tempo' || state.setDrawEnabled

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

      {/* Summary */}
      <div className="glass glass-card px-4 py-4 space-y-2.5">
        <SummaryRow label="Nome" value={state.name} />
        <SummaryRow label="Formato" value={FORMAT_LABEL[state.format]} />
        <SummaryRow label="Unidade" value={UNIT_LABEL[state.unit]} />
        <div className="h-px bg-white/8" />
        <SummaryRow
          label="Rodadas"
          value={`${state.rounds}× round-robin`}
        />
        <SummaryRow label="Contagem" value={countingDesc} />
        <SummaryRow
          label="Pontuação"
          value={`V ${state.pointsWin} · ${allowDraw ? `E ${state.pointsDraw} · ` : ''}D ${state.pointsLoss}`}
        />
        <div className="h-px bg-white/8" />
        <SummaryRow
          label="Participantes"
          value={`${state.players.length} jogadores`}
        />
        <div>
          <p className="text-xs text-white/40 mb-1.5">Desempate</p>
          <ol className="list-decimal list-inside space-y-0.5">
            {state.tiebreakers.map((k) => (
              <li key={k} className="text-xs text-white/60">
                {TIEBREAKER_LABELS[k]}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
          Status inicial
        </p>
        <div className="flex gap-2">
          {(['rascunho', 'ativo'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ status: s })}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 ${
                state.status === s
                  ? 'border-secondary/50 bg-secondary/15 text-secondary'
                  : 'border-white/10 bg-white/5 text-white/50'
              }`}
            >
              {s === 'rascunho' ? 'Rascunho' : 'Ativo'}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/40 px-1">
          {state.status === 'rascunho'
            ? 'Apenas você vê o rascunho. Ative quando estiver pronto.'
            : 'Publicado e visível para todos.'}
        </p>
      </div>

      {/* Create button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending}
        className="w-full rounded-full bg-secondary py-3.5 text-base font-bold text-primary transition active:scale-[0.98] disabled:opacity-50"
      >
        {isPending ? 'Criando campeonato…' : 'Criar campeonato'}
      </button>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function ChampionshipWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(DEFAULT_STATE)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onChange(patch: Patch) {
    setState((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  function next() {
    if (canAdvance(step, state)) setStep((s) => Math.min(5, s + 1))
  }

  function back() {
    if (step > 1) setStep((s) => s - 1)
  }

  function handleBack() {
    if (step === 1) router.push('/campeonatos')
    else back()
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        const supabase = createClient()
        const allowDraw = state.counting === 'tempo' || state.setDrawEnabled
        const { data: id, error: rpcError } = await supabase.rpc(
          'create_liga_championship',
          {
            _name: state.name,
            _points_win: state.pointsWin,
            _points_draw: allowDraw ? state.pointsDraw : 0,
            _points_loss: state.pointsLoss,
            _allow_draw: allowDraw,
            _tiebreakers: state.tiebreakers,
            _stage_counting: state.counting,
            _rounds: state.rounds,
            _sets_to_play: state.setsToPlay,
            _points_per_set: state.pointsPerSet,
            _win_by_two: state.winByTwo,
            _set_draw_enabled: state.setDrawEnabled,
            _time_minutes:
              state.counting === 'tempo' ? Number(state.timeMinutes) : null,
            _player_ids: state.players.map((p) => p.id),
            _status: state.status,
          },
        )
        if (rpcError) throw new Error(rpcError.message)
        router.push(`/campeonatos/${id}`)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao criar campeonato.',
        )
      }
    })
  }

  const isBlocked = state.format !== 'liga' || state.unit !== 'player'
  const canGoForward = canAdvance(step, state)

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 8rem)' }}>
      {/* Step header */}
      <div className="px-5 pt-4 pb-3 space-y-3">
        <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="h-8 w-8 grid place-items-center rounded-full bg-white/8 text-white/60 transition active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-[11px] text-white/40">Passo {step} de 5</p>
            <p className="text-base font-semibold text-white">
              {STEP_TITLES[step - 1]}
            </p>
          </div>
          {/* Cancel X on step 1 or spacer on others */}
          {step === 1 ? (
            <Link
              href="/campeonatos"
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
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {step === 1 && <Step1 state={state} onChange={onChange} />}
        {step === 2 && <Step2 state={state} onChange={onChange} />}
        {step === 3 && <Step3 state={state} onChange={onChange} />}
        {step === 4 && <Step4 state={state} onChange={onChange} />}
        {step === 5 && (
          <Step5
            state={state}
            onChange={onChange}
            onSubmit={handleSubmit}
            isPending={isPending}
            error={error}
          />
        )}
      </div>

      {/* Footer — Avançar (steps 1–4) */}
      {step < 5 && (
        <div className="px-5 pb-6 pt-2">
          {step === 1 && isBlocked && state.name.trim() !== '' ? null : null}
          <button
            type="button"
            onClick={next}
            disabled={!canGoForward}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-secondary py-3.5 text-base font-bold text-primary transition active:scale-[0.98] disabled:opacity-35"
          >
            Avançar
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}
