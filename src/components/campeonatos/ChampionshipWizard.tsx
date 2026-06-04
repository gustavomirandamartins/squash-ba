'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { submitCreation } from '@/lib/offline/submit'
import { loadCategories, loadPlayerPool, type CachedPlayer } from '@/lib/offline/players-cache'
import {
  buildLocalLiga,
  buildLocalEliminatoria,
  buildLocalGrupos,
  qualifiersPerGroup,
  saveLocalChampionship,
} from '@/lib/offline/local-championship'
import type { CreationOp } from '@/lib/offline/types'
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
  Medal,
  GripVertical,
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

// Uma dupla (2 jogadores) confirmada no wizard de criação
type PairEntry = {
  id: string          // chave local (randomUUID)
  p1: PlayerResult
  p2: PlayerResult
}

interface Category {
  id: string
  name: string
}

interface WizardState {
  // Step 1
  name: string
  startDate: string  // 'YYYY-MM-DD' ou '' (sem data definida)
  isOfficial: boolean
  format: Format
  unit: Unit
  // Step 2 — Liga
  rounds: number
  // Step 2 — Eliminatória
  hasThirdPlace: boolean
  // Step 2 — Grupos+Elim
  numGroups: number
  qualifiersPerGroup: number
  // Step 3 — Contagem (liga/elim: single; grupos_elim: two stages)
  counting: Counting
  setsToPlay: 1 | 3 | 5
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: string
  // Step 3 — Grupos contagem (grupos_elim específico)
  groupsCounting: Counting
  groupsRounds: number
  groupsSetsToPlay: 1 | 3 | 5
  groupsPointsPerSet: number
  groupsWinByTwo: boolean
  groupsSetDrawEnabled: boolean
  groupsTimeMinutes: string
  // Step 3 — Pontuação (todos os formatos)
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  tiebreakers: string[]
  // Step 4 — Jogador (unit='player')
  players: PlayerResult[]
  playerSeeds: Record<string, number | null>
  // Step 4 grupos_elim — alocação manual de jogadores (null = snake draft)
  manualGroupAssign: Record<string, number> | null
  // Step 4 — Dupla (unit='pair')
  pairs: PairEntry[]
  pairSeeds: Record<string, number | null>    // pair.id → seed (para elim)
  manualPairGroupAssign: Record<string, number> | null  // pair.id → groupIdx
  // Step 5
  status: 'rascunho' | 'ativo'
}

type Patch = Partial<WizardState>

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: Format; label: string; desc: string; icon: React.ReactNode; enabled: boolean }[] = [
  {
    value: 'liga',
    label: 'Liga',
    desc: 'Todos jogam entre si. Classificação por pontos.',
    icon: <Trophy className="h-5 w-5" />,
    enabled: true,
  },
  {
    value: 'grupos_elim',
    label: 'Grupos + Elim.',
    desc: 'Fase de grupos seguida de eliminatórias.',
    icon: <Layers className="h-5 w-5" />,
    enabled: true,
  },
  {
    value: 'eliminatoria',
    label: 'Eliminatórias',
    desc: 'Chaveamento direto. Quem perde, sai.',
    icon: <GitMerge className="h-5 w-5" />,
    enabled: true,
  },
  {
    value: 'desafio',
    label: 'Desafio',
    desc: 'Confronto direto: 1v1, duplas ou por times.',
    icon: <Swords className="h-5 w-5" />,
    enabled: true,
  },
]

const UNIT_OPTIONS: { value: Unit; label: string; sub: string; icon: React.ReactNode }[] = [
  { value: 'player', label: 'Jogador', sub: '1 vs 1', icon: <User className="h-5 w-5" /> },
  { value: 'pair', label: 'Dupla', sub: '2 vs 2', icon: <Users className="h-5 w-5" /> },
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

const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const DEFAULT_STATE: WizardState = {
  name: '',
  startDate: '',
  isOfficial: false,
  format: 'liga',
  unit: 'player',
  rounds: 1,
  hasThirdPlace: false,
  numGroups: 2,
  qualifiersPerGroup: 2,
  counting: 'set',
  setsToPlay: 3,
  pointsPerSet: 11,
  winByTwo: true,
  setDrawEnabled: false,
  timeMinutes: '',
  groupsCounting: 'set',
  groupsRounds: 1,
  groupsSetsToPlay: 3,
  groupsPointsPerSet: 11,
  groupsWinByTwo: true,
  groupsSetDrawEnabled: false,
  groupsTimeMinutes: '',
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['sets_ganhos', 'pontos_ganhos', 'pontos_sofridos_asc'],
  players: [],
  playerSeeds: {},
  manualGroupAssign: null,
  pairs: [],
  pairSeeds: {},
  manualPairGroupAssign: null,
  status: 'ativo',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  let s = 1
  while (s < n) s *= 2
  return s
}

function bracketNote(n: number, unit: 'player' | 'pair' = 'player'): string | null {
  const word = unit === 'pair' ? 'duplas' : 'jogadores'
  if (n < 2) return null
  if (n === 3) return `3 ${word}: será gerado triangular (todos jogam entre si).`
  const size = nextPow2(n)
  if (size === n) return null
  const byes = size - n
  return `Com ${n} participantes será gerado bracket de ${size} posições (${byes} bye${byes > 1 ? 's' : ''}). Seeds 1 e 2 avançam automaticamente.`
}

/** Snake draft para duplas: pair.id → groupIndex (0-based). */
function computeSnakeDraftPairs(pairs: PairEntry[], numGroups: number): Record<string, number> {
  if (numGroups < 1) return {}
  const assignments: Record<string, number> = {}
  let cur = 0, dir = 1
  for (const p of pairs) {
    assignments[p.id] = cur
    cur += dir
    if (cur >= numGroups) { dir = -1; cur = numGroups - 1 }
    else if (cur < 0)     { dir =  1; cur = 0 }
  }
  return assignments
}

/** Calcula alocação snake draft: player index → group index (0-based). */
function computeSnakeDraft(players: PlayerResult[], numGroups: number): Record<string, number> {
  if (numGroups < 1) return {}
  const assignments: Record<string, number> = {}
  let cur = 0, dir = 1
  for (const p of players) {
    assignments[p.id] = cur
    cur += dir
    if (cur >= numGroups) { dir = -1; cur = numGroups - 1 }
    else if (cur < 0) { dir = 1; cur = 0 }
  }
  return assignments
}

/**
 * Dado os grupos finais (groupIndex → players), gera a ordem de player_ids
 * para que o snake draft do RPC produza o mesmo resultado.
 * Estratégia: interleave posição a posição da forma que o snake espera.
 */
function groupsToPlayerOrder(
  groups: PlayerResult[][],
  numGroups: number,
): { playerIds: string[]; seeds: (number | null)[] } {
  // Flatten: for each position in the snake, pick from the correct group
  const queues = groups.map((g) => [...g])
  const maxSize = Math.max(...queues.map((q) => q.length), 0)
  const result: PlayerResult[] = []
  let cur = 0, dir = 1

  for (let pass = 0; pass < maxSize; pass++) {
    // In each pass, snake assigns one player per group
    // We collect players in the snake order for this pass
    const passAssigns: { gi: number; pos: number }[] = []
    let c = 0, d = 1
    for (let i = 0; i < numGroups; i++) {
      passAssigns.push({ gi: c, pos: i })
      c += d
      if (c >= numGroups) { d = -1; c = numGroups - 1 }
      else if (c < 0) { d = 1; c = 0 }
    }
    // Each position in passAssigns: snake_position → groupIndex
    for (const { gi } of passAssigns) {
      if (queues[gi] && queues[gi].length > 0) {
        result.push(queues[gi].shift()!)
      }
    }
  }

  return { playerIds: result.map((p) => p.id), seeds: result.map(() => null) }
}

/** Agrupa jogadores por grupo usando a alocação final (manual ou snake). */
function groupPlayersByAssignment(
  players: PlayerResult[],
  assignments: Record<string, number>,
  numGroups: number,
): PlayerResult[][] {
  const groups: PlayerResult[][] = Array.from({ length: numGroups }, () => [])
  for (const p of players) {
    const gi = assignments[p.id] ?? 0
    if (gi >= 0 && gi < numGroups) groups[gi].push(p)
  }
  return groups
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
  description,
}: {
  value: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <span className="text-sm text-white/65">{label}</span>
        {description && (
          <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 shrink-0 ${
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
          Por enquanto, <strong className="text-white/70">Liga</strong>,{' '}
          <strong className="text-white/70">Grupos + Elim.</strong> e{' '}
          <strong className="text-white/70">Eliminatórias</strong> com unidade{' '}
          <strong className="text-white/70">Jogador</strong> estão disponíveis.
        </p>
      </div>
    </div>
  )
}

/** Bloco de configuração de contagem reutilizável. */
function CountingBlock({
  label,
  counting,
  setsToPlay,
  pointsPerSet,
  winByTwo,
  setDrawEnabled,
  timeMinutes,
  allowDrawOption = true,
  onChange,
}: {
  label?: string
  counting: Counting
  setsToPlay: 1 | 3 | 5
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: string
  /** #5 — em eliminatórias não há empate; oculta o toggle quando false */
  allowDrawOption?: boolean
  onChange: (patch: {
    counting?: Counting
    setsToPlay?: 1 | 3 | 5
    pointsPerSet?: number
    winByTwo?: boolean
    setDrawEnabled?: boolean
    timeMinutes?: string
  }) => void
}) {
  return (
    <div className="space-y-3">
      {label && (
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {label}
        </p>
      )}
      {/* Counting type */}
      <div className="flex gap-2">
        {(['set', 'tempo'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange({ counting: c })}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95 ${
              counting === c
                ? 'border-secondary/50 bg-secondary/15 text-secondary'
                : 'border-white/10 bg-white/5 text-white/50'
            }`}
          >
            {c === 'set' ? 'Por set' : 'Por tempo'}
          </button>
        ))}
      </div>

      {counting === 'set' ? (
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
                    setsToPlay === n
                      ? 'bg-secondary text-primary'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  {n === 1 ? '1 set' : `MD${n}`}
                </button>
              ))}
            </div>
          </div>
          <NumberField
            label="Pontos por set"
            value={pointsPerSet}
            onChange={(v) => onChange({ pointsPerSet: v })}
            min={3}
            max={21}
          />
          <Toggle
            label="Vencer por 2 pontos"
            value={winByTwo}
            onChange={(v) => onChange({ winByTwo: v })}
          />
          {allowDrawOption && (
            <Toggle
              label={`Empate em ${pointsPerSet}×${pointsPerSet}`}
              value={setDrawEnabled}
              onChange={(v) => onChange({ setDrawEnabled: v })}
            />
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-white/65">Duração (minutos)</span>
          <input
            type="number"
            min={1}
            max={180}
            value={timeMinutes}
            onChange={(e) => onChange({ timeMinutes: e.target.value })}
            placeholder="Ex.: 30"
            className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-center text-sm text-white outline-none placeholder-white/30"
          />
        </div>
      )}
    </div>
  )
}

// ─── canAdvance ───────────────────────────────────────────────────────────────

function canAdvance(step: number, s: WizardState): boolean {
  const isGruposElim = s.format === 'grupos_elim'
  const isElim = s.format === 'eliminatoria'

  if (step === 1) {
    if (!s.name.trim()) return false
    if (s.format === 'desafio') return true  // redireciona para /desafios/novo
    return (
      (s.format === 'liga' || s.format === 'eliminatoria' || s.format === 'grupos_elim') &&
      (s.unit === 'player' || s.unit === 'pair')
    )
  }
  if (step === 2) {
    if (isGruposElim) return s.numGroups >= 2 && s.qualifiersPerGroup >= 1
    if (isElim) return true
    return s.rounds >= 1
  }
  if (step === 3) {
    if (isGruposElim) {
      const groupsOk =
        s.groupsCounting === 'set' ||
        (s.groupsTimeMinutes !== '' && Number(s.groupsTimeMinutes) > 0)
      const elimOk =
        s.counting === 'set' ||
        (s.timeMinutes !== '' && Number(s.timeMinutes) > 0)
      return groupsOk && elimOk
    }
    if (s.counting === 'tempo') return s.timeMinutes !== '' && Number(s.timeMinutes) > 0
    return true
  }
  if (step === 4) {
    if (s.unit === 'pair') return s.pairs.length >= 2
    return s.players.length >= 2
  }
  return true
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const blocked =
    (state.format !== 'liga' &&
      state.format !== 'eliminatoria' &&
      state.format !== 'grupos_elim' &&
      state.format !== 'desafio') ||
    (state.format !== 'desafio' && state.unit === 'team') // 'team' só funciona em desafios

  return (
    <div className="space-y-3">
      <div className="glass glass-card px-4 py-2.5 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
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

      <div className="glass glass-card px-4 py-2.5 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
          Data de início{' '}
          <span className="normal-case font-normal text-white/25">(opcional)</span>
        </p>
        <input
          type="date"
          value={state.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
          className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none [color-scheme:dark]"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 px-1">
          Formato
        </p>
        <div className="grid grid-cols-2 grid-rows-2 gap-1.5">
          {FORMAT_OPTIONS.map((f) => {
            const active = state.format === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => f.enabled && onChange({ format: f.value })}
                className={`glass glass-card flex flex-col items-start gap-1 px-3 py-2.5 text-left transition active:scale-[0.97] relative ${
                  active ? 'border-secondary/50 bg-secondary/10' : ''
                } ${!f.enabled ? 'opacity-45' : ''}`}
              >
                <span className={active ? 'text-secondary' : 'text-white/40'}>
                  {f.icon}
                </span>
                <span className="text-sm font-semibold text-white/90 leading-snug">
                  {f.label}
                </span>
                <span className="text-[10px] text-white/40 leading-snug">{f.desc}</span>
                {!f.enabled && (
                  <span className="absolute top-2 right-2 text-[9px] font-semibold text-white/25 uppercase tracking-widest">
                    breve
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 px-1">
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
                className={`glass glass-card flex flex-1 flex-col items-center gap-0.5 py-2.5 transition active:scale-[0.97] ${
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

      {/* Campeonato oficial — visível só para formatos reais */}
      {state.format !== 'desafio' && (
        <button
          type="button"
          onClick={() => onChange({ isOfficial: !state.isOfficial })}
          className={`glass glass-card flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.98] ${
            state.isOfficial ? 'border-secondary/50 bg-secondary/10' : ''
          }`}
        >
          {/* toggle pill */}
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              state.isOfficial ? 'bg-secondary' : 'bg-white/20'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                state.isOfficial ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white/90">Campeonato oficial</p>
            <p className="text-[11px] leading-snug text-white/40">
              {state.isOfficial
                ? '+5 por participar, +15/10/5 para pódio'
                : 'Não oficial: +5/3/1 para pódio apenas'}
            </p>
          </div>
        </button>
      )}

      {blocked && <ComingSoonBanner />}
    </div>
  )
}

// ─── Step 2 — Liga ────────────────────────────────────────────────────────────

function Step2Liga({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
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
        </p>
      </div>
    </div>
  )
}

// ─── Step 2 — Eliminatória ────────────────────────────────────────────────────

function Step2Eliminatoria({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  return (
    <div className="space-y-4">
      <div className="glass glass-card px-4 py-4 space-y-4">
        <Toggle
          label="Disputa de 3º lugar"
          description="Gera um jogo extra entre os perdedores das semifinais."
          value={state.hasThirdPlace}
          onChange={(v) => onChange({ hasThirdPlace: v })}
        />
      </div>
      <div className="glass glass-card px-4 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-secondary/60 shrink-0" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Como funciona o bracket?
          </p>
        </div>
        <p className="text-sm text-white/55 leading-relaxed">
          Os participantes são chaveados usando o padrão ATP:{' '}
          <strong className="text-white/75">seed 1 vs seed N</strong>,{' '}
          <strong className="text-white/75">seed 2 vs seed N-1</strong> etc.
        </p>
        <p className="text-xs text-white/35 mt-1">
          Se o número de participantes não for potência de 2, os seeds mais altos recebem
          bye automático.
        </p>
      </div>
    </div>
  )
}

// ─── Step 2 — Grupos + Elim ───────────────────────────────────────────────────

function Step2GruposElim({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const total = state.numGroups * state.qualifiersPerGroup
  const isOdd = total % 2 !== 0
  const bracketSize = nextPow2(total)
  const byes = bracketSize - total

  return (
    <div className="space-y-4">
      {/* Group structure */}
      <div className="glass glass-card px-4 py-4 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Estrutura dos grupos
        </p>
        <NumberField
          label="Número de grupos"
          value={state.numGroups}
          onChange={(v) => onChange({ numGroups: Math.max(2, v), manualGroupAssign: null })}
          min={2}
          max={8}
        />
        <NumberField
          label="Classificados por grupo"
          value={state.qualifiersPerGroup}
          onChange={(v) => onChange({ qualifiersPerGroup: Math.max(1, v) })}
          min={1}
          max={8}
        />

        {/* Dynamic note */}
        <div
          className="rounded-xl px-3 py-2.5 space-y-0.5"
          style={{ background: isOdd ? 'rgba(251,146,60,0.08)' : 'rgba(205,253,81,0.07)' }}
        >
          <p className="text-xs font-semibold" style={{ color: isOdd ? 'rgba(251,146,60,0.9)' : 'rgba(205,253,81,0.8)' }}>
            {state.numGroups} grupos × {state.qualifiersPerGroup} classificados = {total} qualificados
          </p>
          <p className="text-[11px]" style={{ color: isOdd ? 'rgba(251,146,60,0.55)' : 'rgba(205,253,81,0.45)' }}>
            {isOdd
              ? 'Número ímpar — será criada uma fase de repescagem entre os 2º colocados.'
              : byes > 0
                ? `Bracket de ${bracketSize} posições (${byes} bye${byes > 1 ? 's' : ''}).`
                : `Bracket direto de ${bracketSize} posições.`}
          </p>
        </div>
      </div>

      {/* Third place */}
      <div className="glass glass-card px-4 py-4">
        <Toggle
          label="Disputa de 3º lugar"
          description="Jogo extra entre os perdedores das semifinais do bracket."
          value={state.hasThirdPlace}
          onChange={(v) => onChange({ hasThirdPlace: v })}
        />
      </div>
    </div>
  )
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

function Step3({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const isGruposElim = state.format === 'grupos_elim'
  const isElim = state.format === 'eliminatoria'
  const [groupsOpen, setGroupsOpen] = useState(true)
  const [elimOpen, setElimOpen] = useState(false)

  const allowDraw = isGruposElim
    ? state.groupsCounting === 'tempo' || state.groupsSetDrawEnabled
    : state.counting === 'tempo' || state.setDrawEnabled

  function moveTiebreaker(idx: number, dir: -1 | 1) {
    const arr = [...state.tiebreakers]
    const target = idx + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
    onChange({ tiebreakers: arr })
  }

  return (
    <div className="space-y-4">
      {isGruposElim ? (
        /* Two counting blocks for grupos_elim */
        <>
          {/* Groups stage */}
          <div className="glass glass-card overflow-hidden">
            <button
              type="button"
              onClick={() => setGroupsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-secondary/60 shrink-0" />
                <span className="text-sm font-semibold text-white/80">Fase de grupos</span>
              </div>
              {groupsOpen ? (
                <ChevronUp className="h-4 w-4 text-white/30" />
              ) : (
                <ChevronDown className="h-4 w-4 text-white/30" />
              )}
            </button>
            {groupsOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3">
                <CountingBlock
                  counting={state.groupsCounting}
                  setsToPlay={state.groupsSetsToPlay}
                  pointsPerSet={state.groupsPointsPerSet}
                  winByTwo={state.groupsWinByTwo}
                  setDrawEnabled={state.groupsSetDrawEnabled}
                  timeMinutes={state.groupsTimeMinutes}
                  onChange={(p) => onChange({
                    groupsCounting: p.counting ?? state.groupsCounting,
                    groupsSetsToPlay: p.setsToPlay ?? state.groupsSetsToPlay,
                    groupsPointsPerSet: p.pointsPerSet ?? state.groupsPointsPerSet,
                    groupsWinByTwo: p.winByTwo ?? state.groupsWinByTwo,
                    groupsSetDrawEnabled: p.setDrawEnabled ?? state.groupsSetDrawEnabled,
                    groupsTimeMinutes: p.timeMinutes ?? state.groupsTimeMinutes,
                  })}
                />
              </div>
            )}
          </div>

          {/* Elim stage */}
          <div className="glass glass-card overflow-hidden">
            <button
              type="button"
              onClick={() => setElimOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
            >
              <div className="flex items-center gap-2">
                <GitMerge className="h-4 w-4 text-secondary/60 shrink-0" />
                <div>
                  <span className="text-sm font-semibold text-white/80">Fase eliminatória</span>
                  <p className="text-[10px] text-white/35 mt-0.5">Pode ser diferente da fase de grupos.</p>
                </div>
              </div>
              {elimOpen ? (
                <ChevronUp className="h-4 w-4 text-white/30" />
              ) : (
                <ChevronDown className="h-4 w-4 text-white/30" />
              )}
            </button>
            {elimOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3">
                <CountingBlock
                  counting={state.counting}
                  setsToPlay={state.setsToPlay}
                  pointsPerSet={state.pointsPerSet}
                  winByTwo={state.winByTwo}
                  setDrawEnabled={state.setDrawEnabled}
                  timeMinutes={state.timeMinutes}
                  allowDrawOption={false}
                  onChange={(p) => onChange({
                    counting: p.counting ?? state.counting,
                    setsToPlay: p.setsToPlay ?? state.setsToPlay,
                    pointsPerSet: p.pointsPerSet ?? state.pointsPerSet,
                    winByTwo: p.winByTwo ?? state.winByTwo,
                    setDrawEnabled: p.setDrawEnabled ?? state.setDrawEnabled,
                    timeMinutes: p.timeMinutes ?? state.timeMinutes,
                  })}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        /* Single counting block for liga/elim */
        <div className="glass glass-card px-4 py-4 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Sistema de contagem
          </p>
          <CountingBlock
            counting={state.counting}
            setsToPlay={state.setsToPlay}
            pointsPerSet={state.pointsPerSet}
            winByTwo={state.winByTwo}
            setDrawEnabled={state.setDrawEnabled}
            timeMinutes={state.timeMinutes}
            allowDrawOption={!isElim}
            onChange={(p) => onChange({
              counting: p.counting ?? state.counting,
              setsToPlay: p.setsToPlay ?? state.setsToPlay,
              pointsPerSet: p.pointsPerSet ?? state.pointsPerSet,
              winByTwo: p.winByTwo ?? state.winByTwo,
              setDrawEnabled: p.setDrawEnabled ?? state.setDrawEnabled,
              timeMinutes: p.timeMinutes ?? state.timeMinutes,
            })}
          />
        </div>
      )}

      {/* Table scoring — eliminatória pura não tem classificação/pontuação (#5) */}
      {!isElim && (
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
      )}

      {/* Tiebreakers — idem, só onde há classificação */}
      {!isElim && (
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
      )}
    </div>
  )
}

// ─── Group preview (Step 4 — Grupos+Elim) ────────────────────────────────────

function GroupPreview({
  players,
  numGroups,
  assignments,
  onMove,
}: {
  players: PlayerResult[]
  numGroups: number
  assignments: Record<string, number>
  onMove: (playerId: string, newGroupIdx: number) => void
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const groups = groupPlayersByAssignment(players, assignments, numGroups)

  const groupBalance = groups.map((g) => g.length)
  const maxSize = Math.max(...groupBalance)
  const minSize = Math.min(...groupBalance)
  const isUnbalanced = maxSize - minSize > 1

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Distribuição dos grupos
        </p>
        <span className="text-[10px] text-white/25">arraste para realocar</span>
      </div>

      {isUnbalanced && (
        <div className="flex items-center gap-2 glass glass-card px-3.5 py-2.5"
          style={{ borderColor: 'rgba(251,146,60,0.3)' }}>
          <AlertCircle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
          <p className="text-xs text-orange-300/80">
            Grupos desbalanceados (diferença &gt; 1 jogador).
          </p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {Array.from({ length: numGroups }, (_, gi) => (
          <div
            key={gi}
            onDragOver={(e) => { e.preventDefault(); setDragOver(gi) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging) { onMove(dragging, gi); setDragging(null) }
              setDragOver(null)
            }}
            className={`shrink-0 w-36 rounded-2xl p-3 space-y-2 border transition-colors ${
              dragOver === gi
                ? 'border-secondary/60 bg-secondary/10'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-secondary">
                Grupo {GROUP_NAMES[gi] ?? String(gi + 1)}
              </span>
              <span className="text-[10px] text-white/30">{groups[gi].length}</span>
            </div>

            {groups[gi].length === 0 ? (
              <p className="text-[10px] text-white/25 text-center py-2">vazio</p>
            ) : (
              groups[gi].map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDragging(p.id)}
                  onDragEnd={() => { setDragging(null); setDragOver(null) }}
                  className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 cursor-grab active:cursor-grabbing transition-opacity ${
                    dragging === p.id ? 'opacity-40' : 'bg-white/8 hover:bg-white/12'
                  }`}
                >
                  <GripVertical className="h-3 w-3 text-white/20 shrink-0" />
                  <PlayerAvatar player={p} size={20} />
                  <span className="text-[11px] text-white/75 truncate flex-1 min-w-0">
                    {p.full_name?.split(' ')[0] ?? '—'}
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Step 4 — Duplas ──────────────────────────────────────────────────────────
//  UX: clica 1° jogador → banner "montando" aparece → clica 2° → par confirmado.

function Step4Pairs({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const [query, setQuery]                   = useState('')
  const [categories, setCategories]         = useState<Category[]>([])
  const [filterCategories, setFilterCategories] = useState<string[]>([])
  const [pool, setPool]                     = useState<CachedPlayer[]>([])
  const [loadingPool, setLoadingPool]       = useState(true)
  const [buildingP1, setBuildingP1]         = useState<PlayerResult | null>(null)

  const isElim       = state.format === 'eliminatoria'
  const isGruposElim = state.format === 'grupos_elim'
  const showSeeds    = isElim || isGruposElim

  // Online: busca e cacheia; offline: lê o último snapshot do IndexedDB.
  useEffect(() => {
    loadCategories().then(setCategories)
  }, [])

  useEffect(() => {
    setLoadingPool(true)
    loadPlayerPool().then((data) => { setPool(data); setLoadingPool(false) })
  }, [])

  // IDs já alocados em alguma dupla
  const usedIds = new Set(state.pairs.flatMap((p) => [p.p1.id, p.p2.id]))

  // Filtro por categoria aplicado no CLIENTE (funciona offline).
  const available = pool.filter(
    (p) =>
      !usedIds.has(p.id) &&
      p.id !== buildingP1?.id &&
      (filterCategories.length === 0 ||
        (p.category_id !== null && filterCategories.includes(p.category_id))) &&
      (!query.trim() || (p.full_name ?? '').toLowerCase().includes(query.trim().toLowerCase())),
  )

  function toggleCategory(id: string) {
    setFilterCategories((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id])
  }

  function handlePlayerClick(player: PlayerResult) {
    if (!buildingP1) {
      setBuildingP1(player)
    } else {
      // Confirma a dupla
      const newPair: PairEntry = {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : String(Date.now()) + Math.random().toString(36).slice(2),
        p1: buildingP1,
        p2: player,
      }
      onChange({ pairs: [...state.pairs, newPair], manualPairGroupAssign: null })
      setBuildingP1(null)
    }
  }

  function removePair(pairId: string) {
    const newSeeds = { ...state.pairSeeds }
    delete newSeeds[pairId]
    const cur = state.manualPairGroupAssign ?? {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [pairId]: _removed, ...restAssign } = cur
    onChange({
      pairs: state.pairs.filter((p) => p.id !== pairId),
      pairSeeds: newSeeds,
      manualPairGroupAssign: Object.keys(restAssign).length ? restAssign : null,
    })
  }

  function setPairSeed(pairId: string, seed: number | null) {
    onChange({ pairSeeds: { ...state.pairSeeds, [pairId]: seed } })
  }

  function movePair(pairId: string, newGroupIdx: number) {
    const cur = state.manualPairGroupAssign ?? computeSnakeDraftPairs(state.pairs, state.numGroups)
    onChange({ manualPairGroupAssign: { ...cur, [pairId]: newGroupIdx } })
  }

  // Para GroupPreview: converte pairs em PlayerResult-like (usa pair.id como id)
  const pairsAsPlayers: PlayerResult[] = state.pairs.map((pair) => ({
    id: pair.id,
    full_name: `${pair.p1.full_name?.split(' ')[0] ?? '?'} + ${pair.p2.full_name?.split(' ')[0] ?? '?'}`,
    avatar_url: null,
  }))
  const pairGroupAssignments =
    state.manualPairGroupAssign ?? computeSnakeDraftPairs(state.pairs, state.numGroups)

  const note = isElim ? bracketNote(state.pairs.length, 'pair') : null

  return (
    <div className="space-y-4">
      {/* Banner "montando dupla" */}
      {buildingP1 && (
        <div
          className="glass glass-card px-4 py-3 space-y-2"
          style={{ borderColor: 'rgba(205,253,81,0.3)' }}
        >
          <p className="text-[11px] font-semibold text-secondary/70 uppercase tracking-wider">
            Selecione o 2° jogador da dupla
          </p>
          <div className="flex items-center gap-3">
            <PlayerAvatar player={buildingP1} size={32} />
            <span className="flex-1 text-sm font-semibold text-white/85 truncate">
              {buildingP1.full_name ?? 'Jogador'}
            </span>
            <span className="text-secondary/60 text-sm font-bold shrink-0">+ ?</span>
          </div>
          <button
            type="button"
            onClick={() => setBuildingP1(null)}
            className="text-xs text-white/35 hover:text-white/60 transition"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Filtro por categoria */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
            Filtrar por categoria{' '}
            <span className="normal-case font-normal text-white/30">(opcional)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const active = filterCategories.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
                    active ? 'bg-secondary text-primary' : 'glass border-white/10 text-white/55 hover:text-white/80'
                  }`}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Busca */}
      <div className="glass glass-card flex items-center gap-2 px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={buildingP1 ? 'Selecione o 2° jogador…' : 'Filtrar por nome…'}
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            <X className="h-4 w-4 text-white/40" />
          </button>
        )}
      </div>

      {/* Disponíveis */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            {buildingP1 ? '2° jogador' : 'Disponíveis'}
          </p>
          {!loadingPool && <span className="text-xs text-white/30">{available.length}</span>}
        </div>
        {loadingPool ? (
          <p className="py-6 text-center text-xs text-white/35">Carregando jogadores…</p>
        ) : available.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/35">
            {query.trim()
              ? `Nenhum resultado para "${query.trim()}".`
              : 'Nenhum jogador disponível.'}
          </p>
        ) : (
          available.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePlayerClick(p)}
              className="glass glass-card w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition active:scale-[0.98]"
            >
              <PlayerAvatar player={p} size={32} />
              <span className="flex-1 text-sm text-white/85">{p.full_name ?? 'Sem nome'}</span>
              <span className="text-xs font-semibold text-secondary/80">
                {buildingP1 ? '+ Par' : '+ Selecionar'}
              </span>
            </button>
          ))
        )}
      </div>

      {state.pairs.length > 0 && <div className="h-px bg-white/8" />}

      {/* Duplas confirmadas */}
      {state.pairs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
              {showSeeds ? 'Duplas + seeds' : 'Duplas'}
            </p>
            <span
              className={`text-xs font-semibold ${
                state.pairs.length < 2 ? 'text-white/30' : 'text-secondary'
              }`}
            >
              {state.pairs.length} {state.pairs.length === 1 ? 'dupla' : 'duplas'}
              {state.pairs.length < 2 && ' (mín. 2)'}
            </span>
          </div>

          {state.pairs.map((pair) => (
            <div key={pair.id} className="glass glass-card flex items-center gap-3 px-3.5 py-2.5">
              {/* Mini-avatares sobrepostos */}
              <div className="flex -space-x-2 shrink-0">
                <PlayerAvatar player={pair.p1} size={26} />
                <PlayerAvatar player={pair.p2} size={26} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate">
                  {pair.p1.full_name?.split(' ')[0] ?? '?'}
                  <span className="text-white/30 mx-1">/</span>
                  {pair.p2.full_name?.split(' ')[0] ?? '?'}
                </p>
              </div>

              {/* Seed (eliminatória / grupos) */}
              {showSeeds && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-white/30 mr-1">Seed</span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = state.pairSeeds[pair.id] ?? null
                      if (cur !== null && cur > 1) setPairSeed(pair.id, cur - 1)
                      else if (cur === 1) setPairSeed(pair.id, null)
                    }}
                    className="h-6 w-6 rounded-full bg-white/10 text-white/50 grid place-items-center text-xs leading-none transition active:scale-95"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-xs font-bold text-secondary">
                    {state.pairSeeds[pair.id] ?? '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = state.pairSeeds[pair.id] ?? null
                      const next = cur === null ? 1 : cur + 1
                      if (next <= state.pairs.length) setPairSeed(pair.id, next)
                    }}
                    className="h-6 w-6 rounded-full bg-white/10 text-white/50 grid place-items-center text-xs leading-none transition active:scale-95"
                  >
                    +
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => removePair(pair.id)}
                className="h-7 w-7 grid place-items-center rounded-full text-white/30 hover:bg-white/8 hover:text-red-400 transition active:scale-95 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {note && (
            <div
              className="glass glass-card flex items-start gap-2.5 px-3.5 py-3"
              style={{ borderColor: 'rgba(205,253,81,0.2)' }}
            >
              <Info className="h-3.5 w-3.5 text-secondary/60 shrink-0 mt-0.5" />
              <p className="text-xs text-white/50 leading-relaxed">{note}</p>
            </div>
          )}
        </div>
      )}

      {/* Prévia de grupos (grupos_elim) */}
      {isGruposElim && state.pairs.length >= 2 && (
        <>
          <div className="h-px bg-white/8" />
          <GroupPreview
            players={pairsAsPlayers}
            numGroups={state.numGroups}
            assignments={pairGroupAssignments}
            onMove={movePair}
          />
        </>
      )}

      {state.pairs.length === 0 && !loadingPool && available.length > 0 && !buildingP1 && (
        <p className="text-center text-xs text-white/25">
          Selecione um jogador para começar a montar a dupla.
        </p>
      )}
    </div>
  )
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────

function Step4({ state, onChange }: { state: WizardState; onChange: (p: Patch) => void }) {
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [filterCategories, setFilterCategories] = useState<string[]>([])
  const [pool, setPool] = useState<CachedPlayer[]>([])
  const [loadingPool, setLoadingPool] = useState(true)
  const isElim = state.format === 'eliminatoria'
  const isGruposElim = state.format === 'grupos_elim'
  const showSeeds = isElim || isGruposElim

  // Online: busca e cacheia; offline: lê o último snapshot do IndexedDB.
  useEffect(() => {
    loadCategories().then(setCategories)
  }, [])

  useEffect(() => {
    setLoadingPool(true)
    loadPlayerPool().then((data) => { setPool(data); setLoadingPool(false) })
  }, [])

  // Current group assignments (snake or manual)
  const groupAssignments = state.manualGroupAssign ?? computeSnakeDraft(state.players, state.numGroups)

  function toggleCategory(id: string) {
    setFilterCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  // Filtro por categoria aplicado no CLIENTE (funciona offline).
  const available = pool.filter(
    (p) =>
      !state.players.find((s) => s.id === p.id) &&
      (filterCategories.length === 0 ||
        (p.category_id !== null && filterCategories.includes(p.category_id))) &&
      (!query.trim() || p.full_name?.toLowerCase().includes(query.trim().toLowerCase())),
  )

  function addPlayer(p: PlayerResult) {
    const newPlayers = [...state.players, p]
    // Recalculate snake draft for the new list (reset manual assignments)
    onChange({ players: newPlayers, manualGroupAssign: null })
  }

  function removePlayer(id: string) {
    const newSeeds = { ...state.playerSeeds }
    delete newSeeds[id]
    const newPlayers = state.players.filter((p) => p.id !== id)
    onChange({ players: newPlayers, playerSeeds: newSeeds, manualGroupAssign: null })
  }

  function setSeed(playerId: string, seed: number | null) {
    onChange({ playerSeeds: { ...state.playerSeeds, [playerId]: seed } })
  }

  function moveToGroup(playerId: string, newGroupIdx: number) {
    const current = state.manualGroupAssign ?? computeSnakeDraft(state.players, state.numGroups)
    onChange({ manualGroupAssign: { ...current, [playerId]: newGroupIdx } })
  }

  const note = isElim ? bracketNote(state.players.length) : null

  return (
    <div className="space-y-4">
      {/* Category filter */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">
            Filtrar por categoria{' '}
            <span className="normal-case font-normal text-white/30">(opcional)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const active = filterCategories.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
                    active ? 'bg-secondary text-primary' : 'glass border-white/10 text-white/55 hover:text-white/80'
                  }`}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="glass glass-card flex items-center gap-2 px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar por nome…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            <X className="h-4 w-4 text-white/40" />
          </button>
        )}
      </div>

      {/* Available players */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Disponíveis
          </p>
          {!loadingPool && <span className="text-xs text-white/30">{available.length}</span>}
        </div>
        {loadingPool ? (
          <p className="py-6 text-center text-xs text-white/35">Carregando jogadores…</p>
        ) : available.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/35">
            {query.trim()
              ? `Nenhum resultado para "${query.trim()}".`
              : filterCategories.length > 0
                ? 'Nenhum jogador nesta categoria.'
                : 'Nenhum jogador cadastrado.'}
          </p>
        ) : (
          available.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addPlayer(p)}
              className="glass glass-card w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition active:scale-[0.98]"
            >
              <PlayerAvatar player={p} size={32} />
              <span className="flex-1 text-sm text-white/85">{p.full_name ?? 'Sem nome'}</span>
              <span className="text-xs font-semibold text-secondary/80">+ Adicionar</span>
            </button>
          ))
        )}
      </div>

      {state.players.length > 0 && <div className="h-px bg-white/8" />}

      {/* Selected players */}
      {state.players.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
              {showSeeds ? 'Selecionados + seeds' : 'Selecionados'}
            </p>
            <span className={`text-xs font-semibold ${state.players.length < 2 ? 'text-white/30' : 'text-secondary'}`}>
              {state.players.length} {state.players.length === 1 ? 'jogador' : 'jogadores'}
              {state.players.length < 2 && ' (mín. 2)'}
            </span>
          </div>

          {state.players.map((p) => (
            <div key={p.id} className="glass glass-card flex items-center gap-3 px-3.5 py-2.5">
              <PlayerAvatar player={p} size={32} />
              <span className="flex-1 text-sm text-white/85 min-w-0 truncate">
                {p.full_name ?? 'Sem nome'}
              </span>

              {/* Seed input */}
              {showSeeds && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-white/30 mr-1">Seed</span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = state.playerSeeds[p.id] ?? null
                      if (cur !== null && cur > 1) setSeed(p.id, cur - 1)
                      else if (cur === 1) setSeed(p.id, null)
                    }}
                    className="h-6 w-6 rounded-full bg-white/10 text-white/50 grid place-items-center text-xs leading-none transition active:scale-95"
                  >−</button>
                  <span className="w-7 text-center text-xs font-bold text-secondary">
                    {state.playerSeeds[p.id] ?? '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = state.playerSeeds[p.id] ?? null
                      const next = cur === null ? 1 : cur + 1
                      if (next <= state.players.length) setSeed(p.id, next)
                    }}
                    className="h-6 w-6 rounded-full bg-white/10 text-white/50 grid place-items-center text-xs leading-none transition active:scale-95"
                  >+</button>
                </div>
              )}

              <button
                type="button"
                onClick={() => removePlayer(p.id)}
                className="h-7 w-7 grid place-items-center rounded-full text-white/30 hover:bg-white/8 hover:text-red-400 transition active:scale-95 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Bracket note for eliminatória */}
          {note && (
            <div className="glass glass-card flex items-start gap-2.5 px-3.5 py-3 mt-1"
              style={{ borderColor: 'rgba(205,253,81,0.2)' }}>
              <Info className="h-3.5 w-3.5 text-secondary/60 shrink-0 mt-0.5" />
              <p className="text-xs text-white/50 leading-relaxed">{note}</p>
            </div>
          )}
        </div>
      )}

      {/* Group preview for grupos_elim */}
      {isGruposElim && state.players.length >= 2 && (
        <>
          <div className="h-px bg-white/8" />
          <GroupPreview
            players={state.players}
            numGroups={state.numGroups}
            assignments={groupAssignments}
            onMove={moveToGroup}
          />
        </>
      )}

      {state.players.length === 0 && !loadingPool && available.length > 0 && (
        <p className="text-center text-xs text-white/25">
          Toque em um jogador para adicioná-lo.
        </p>
      )}
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
    state.format === 'grupos_elim'
      ? state.groupsCounting === 'tempo' || state.groupsSetDrawEnabled
      : state.counting === 'tempo' || state.setDrawEnabled

  const isElim = state.format === 'eliminatoria'
  const isGruposElim = state.format === 'grupos_elim'

  const countingDesc = (counting: Counting, setsToPlay: number, pointsPerSet: number, timeMinutes: string) =>
    counting === 'set'
      ? `Por set — ${setsToPlay === 1 ? '1 set' : `MD${setsToPlay}`}, ${pointsPerSet} pts/set`
      : `Por tempo — ${timeMinutes} min`

  const isPairMode = state.unit === 'pair'
  const seededPlayers = state.players.filter((p) => state.playerSeeds[p.id] != null)
  const unseededPlayers = state.players.filter((p) => state.playerSeeds[p.id] == null)
  const seededPairs = state.pairs.filter((p) => state.pairSeeds[p.id] != null)
  const unseededPairs = state.pairs.filter((p) => state.pairSeeds[p.id] == null)

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="glass glass-card px-4 py-4 space-y-2.5">
        <SummaryRow label="Nome" value={state.name} />
        {state.startDate && (
          <SummaryRow
            label="Início"
            value={new Date(state.startDate + 'T00:00:00').toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          />
        )}
        <SummaryRow label="Formato" value={FORMAT_LABEL[state.format]} />
        <SummaryRow label="Unidade" value={UNIT_LABEL[state.unit]} />
        {state.format !== 'desafio' && (
          <SummaryRow label="Oficial" value={state.isOfficial ? 'Sim' : 'Não'} />
        )}
        <div className="h-px bg-white/8" />

        {isGruposElim ? (
          <>
            <SummaryRow label="Grupos" value={`${state.numGroups} grupos × ${state.qualifiersPerGroup} classificados`} />
            <SummaryRow label="3º lugar" value={state.hasThirdPlace ? 'Sim' : 'Não'} />
            <SummaryRow
              label="Grupos"
              value={countingDesc(state.groupsCounting, state.groupsSetsToPlay, state.groupsPointsPerSet, state.groupsTimeMinutes)}
            />
            <SummaryRow
              label="Eliminatória"
              value={countingDesc(state.counting, state.setsToPlay, state.pointsPerSet, state.timeMinutes)}
            />
            <SummaryRow
              label="Pontuação"
              value={`V ${state.pointsWin} · ${allowDraw ? `E ${state.pointsDraw} · ` : ''}D ${state.pointsLoss}`}
            />
            <div className="h-px bg-white/8" />
            <SummaryRow
              label="Participantes"
              value={isPairMode ? `${state.pairs.length} duplas` : `${state.players.length} jogadores`}
            />
          </>
        ) : isElim ? (
          <>
            <SummaryRow label="3º lugar" value={state.hasThirdPlace ? 'Sim' : 'Não'} />
            <SummaryRow label="Contagem" value={countingDesc(state.counting, state.setsToPlay, state.pointsPerSet, state.timeMinutes)} />
            <div className="h-px bg-white/8" />
            <SummaryRow
              label="Participantes"
              value={isPairMode ? `${state.pairs.length} duplas` : `${state.players.length} jogadores`}
            />
            {/* Seeds — jogadores */}
            {!isPairMode && seededPlayers.length > 0 && (
              <div>
                <p className="text-xs text-white/40 mb-1.5">Seeds</p>
                <div className="space-y-1">
                  {state.players
                    .filter((p) => state.playerSeeds[p.id] != null)
                    .sort((a, b) => (state.playerSeeds[a.id] ?? 99) - (state.playerSeeds[b.id] ?? 99))
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-secondary w-5 text-right">
                          {state.playerSeeds[p.id]}
                        </span>
                        <span className="text-xs text-white/60">{p.full_name}</span>
                      </div>
                    ))}
                  {unseededPlayers.length > 0 && (
                    <p className="text-xs text-white/30 mt-1">
                      {unseededPlayers.length} sem seed (distribuídos após os seedados)
                    </p>
                  )}
                </div>
              </div>
            )}
            {/* Seeds — duplas */}
            {isPairMode && seededPairs.length > 0 && (
              <div>
                <p className="text-xs text-white/40 mb-1.5">Seeds</p>
                <div className="space-y-1">
                  {state.pairs
                    .filter((p) => state.pairSeeds[p.id] != null)
                    .sort((a, b) => (state.pairSeeds[a.id] ?? 99) - (state.pairSeeds[b.id] ?? 99))
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-secondary w-5 text-right">
                          {state.pairSeeds[p.id]}
                        </span>
                        <span className="text-xs text-white/60">
                          {p.p1.full_name?.split(' ')[0]} / {p.p2.full_name?.split(' ')[0]}
                        </span>
                      </div>
                    ))}
                  {unseededPairs.length > 0 && (
                    <p className="text-xs text-white/30 mt-1">
                      {unseededPairs.length} sem seed (distribuídas após as seedadas)
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <SummaryRow label="Rodadas" value={`${state.rounds}× round-robin`} />
            <SummaryRow label="Contagem" value={countingDesc(state.counting, state.setsToPlay, state.pointsPerSet, state.timeMinutes)} />
            <SummaryRow
              label="Pontuação"
              value={`V ${state.pointsWin} · ${allowDraw ? `E ${state.pointsDraw} · ` : ''}D ${state.pointsLoss}`}
            />
            <div className="h-px bg-white/8" />
            <SummaryRow
              label="Participantes"
              value={isPairMode ? `${state.pairs.length} duplas` : `${state.players.length} jogadores`}
            />
            <div>
              <p className="text-xs text-white/40 mb-1.5">Desempate</p>
              <ol className="list-decimal list-inside space-y-0.5">
                {state.tiebreakers.map((k) => (
                  <li key={k} className="text-xs text-white/60">{TIEBREAKER_LABELS[k]}</li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>

      {/* Status — grupos_elim always activates (RPC limitation) */}
      {!isGruposElim && (
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
              : isElim
                ? 'Publicado. O bracket será gerado automaticamente ao ativar.'
                : 'Publicado e visível para todos.'}
          </p>
        </div>
      )}

      {isGruposElim && (
        <div className="glass glass-card px-4 py-3 flex items-start gap-2.5"
          style={{ borderColor: 'rgba(205,253,81,0.2)' }}>
          <Info className="h-3.5 w-3.5 text-secondary/60 shrink-0 mt-0.5" />
          <p className="text-xs text-white/50 leading-relaxed">
            Campeonatos Grupos + Eliminatórias são criados diretamente no status{' '}
            <strong className="text-white/70">Ativo</strong> e os jogos da fase de grupos
            são gerados automaticamente.
          </p>
        </div>
      )}

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
  // Controla posição do sticky CTA: online tem tab-bar fixa (~8rem), offline não.
  const [isOffline, setIsOffline] = useState(false)
  useEffect(() => {
    setIsOffline(!navigator.onLine)
    const up = () => setIsOffline(false)
    const down = () => setIsOffline(true)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  function onChange(patch: Patch) {
    setState((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  function next() {
    // Desafio tem fluxo próprio em /desafios/novo — passa o nome já digitado
    if (step === 1 && state.format === 'desafio') {
      const qs = state.name.trim()
        ? `?name=${encodeURIComponent(state.name.trim())}`
        : ''
      router.push(`/desafios/novo${qs}`)
      return
    }
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
        const FORMAT_LABEL: Record<string, string> = {
          liga: 'Liga',
          eliminatoria: 'Eliminatória',
          grupos_elim: 'Grupos + Eliminatórias',
        }
        const isPairMode = state.unit === 'pair'
        const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine
        const participantCount = isPairMode ? state.pairs.length : state.players.length
        const snapshot = {
          name: state.name,
          subtitle: `${FORMAT_LABEL[state.format] ?? 'Campeonato'} · ${participantCount} ${isPairMode ? 'duplas' : 'jogadores'}`,
        }

        let op: CreationOp
        if (state.format === 'eliminatoria') {
          op = {
            type: 'champ_elim',
            cfg: {
              name: state.name,
              startDate: state.startDate || null,
              isOfficial: state.isOfficial,
              hasThirdPlace: state.hasThirdPlace,
              counting: state.counting,
              setsToPlay: state.setsToPlay,
              pointsPerSet: state.pointsPerSet,
              winByTwo: state.winByTwo,
              setDrawEnabled: state.setDrawEnabled,
              timeMinutes: state.counting === 'tempo' ? Number(state.timeMinutes) : null,
              pointsWin: state.pointsWin,
              pointsDraw: state.counting === 'tempo' || state.setDrawEnabled ? state.pointsDraw : 0,
              pointsLoss: state.pointsLoss,
              tiebreakers: state.tiebreakers,
              players: isPairMode
                ? []
                : state.players.map((p) => ({ userId: p.id, seed: state.playerSeeds[p.id] ?? null })),
              pairs: isPairMode
                ? state.pairs.map((p) => ({ p1: p.p1.id, p2: p.p2.id, seed: state.pairSeeds[p.id] ?? null }))
                : undefined,
              // Offline → força 'ativo' p/ o servidor gerar o bracket ao sincronizar.
              status: offlineNow ? 'ativo' : state.status,
            },
          }
        } else if (state.format === 'grupos_elim') {
          if (isPairMode) {
            const pairAssignments =
              state.manualPairGroupAssign ?? computeSnakeDraftPairs(state.pairs, state.numGroups)
            const allowDraw = state.groupsCounting === 'tempo' || state.groupsSetDrawEnabled
            op = {
              type: 'champ_grupos',
              cfg: {
                name: state.name,
                startDate: state.startDate || null,
                isOfficial: state.isOfficial,
                numGroups: state.numGroups,
                qualifiersPerGroup: state.qualifiersPerGroup,
                pointsWin: state.pointsWin,
                pointsDraw: allowDraw ? state.pointsDraw : 0,
                pointsLoss: state.pointsLoss,
                allowDraw,
                tiebreakers: state.tiebreakers,
                groupsCounting: state.groupsCounting,
                groupsRounds: state.groupsRounds,
                groupsSetsToPlay: state.groupsSetsToPlay,
                groupsPointsPerSet: state.groupsPointsPerSet,
                groupsWinByTwo: state.groupsWinByTwo,
                groupsSetDrawEnabled: state.groupsSetDrawEnabled,
                groupsTimeMinutes:
                  state.groupsCounting === 'tempo' ? Number(state.groupsTimeMinutes) : null,
                elimCounting: state.counting,
                elimSetsToPlay: state.setsToPlay,
                elimPointsPerSet: state.pointsPerSet,
                elimWinByTwo: state.winByTwo,
                elimSetDrawEnabled: false,
                elimTimeMinutes: state.counting === 'tempo' ? Number(state.timeMinutes) : null,
                hasThirdPlace: state.hasThirdPlace,
                players: [],
                pairs: state.pairs.map((p) => ({
                  p1: p.p1.id,
                  p2: p.p2.id,
                  seed: state.pairSeeds[p.id] ?? null,
                  groupIndex: pairAssignments[p.id] ?? 0,
                })),
                status: 'ativo',
              },
            }
          } else {
          const assignments =
            state.manualGroupAssign ?? computeSnakeDraft(state.players, state.numGroups)
          const groups = groupPlayersByAssignment(state.players, assignments, state.numGroups)
          const orderedPlayers = groups.flat()
          const allowDraw = state.groupsCounting === 'tempo' || state.groupsSetDrawEnabled
          op = {
            type: 'champ_grupos',
            cfg: {
              name: state.name,
              startDate: state.startDate || null,
              isOfficial: state.isOfficial,
              numGroups: state.numGroups,
              qualifiersPerGroup: state.qualifiersPerGroup,
              pointsWin: state.pointsWin,
              pointsDraw: allowDraw ? state.pointsDraw : 0,
              pointsLoss: state.pointsLoss,
              allowDraw,
              tiebreakers: state.tiebreakers,
              groupsCounting: state.groupsCounting,
              groupsRounds: state.groupsRounds,
              groupsSetsToPlay: state.groupsSetsToPlay,
              groupsPointsPerSet: state.groupsPointsPerSet,
              groupsWinByTwo: state.groupsWinByTwo,
              groupsSetDrawEnabled: state.groupsSetDrawEnabled,
              groupsTimeMinutes:
                state.groupsCounting === 'tempo' ? Number(state.groupsTimeMinutes) : null,
              elimCounting: state.counting,
              elimSetsToPlay: state.setsToPlay,
              elimPointsPerSet: state.pointsPerSet,
              elimWinByTwo: state.winByTwo,
              elimSetDrawEnabled: false, // #5 — eliminatória nunca tem empate
              elimTimeMinutes: state.counting === 'tempo' ? Number(state.timeMinutes) : null,
              hasThirdPlace: state.hasThirdPlace,
              players: orderedPlayers.map((p) => ({ userId: p.id, seed: state.playerSeeds[p.id] ?? null })),
              status: 'ativo',
            },
          }
          } // end !isPairMode
        } else {
          // Liga
          const allowDraw = state.counting === 'tempo' || state.setDrawEnabled
          op = {
            type: 'champ_liga',
            cfg: {
              name: state.name,
              startDate: state.startDate || null,
              isOfficial: state.isOfficial,
              pointsWin: state.pointsWin,
              pointsDraw: allowDraw ? state.pointsDraw : 0,
              pointsLoss: state.pointsLoss,
              allowDraw,
              tiebreakers: state.tiebreakers,
              counting: state.counting,
              rounds: state.rounds,
              setsToPlay: state.setsToPlay,
              pointsPerSet: state.pointsPerSet,
              winByTwo: state.winByTwo,
              setDrawEnabled: state.setDrawEnabled,
              timeMinutes: state.counting === 'tempo' ? Number(state.timeMinutes) : null,
              playerIds: isPairMode ? [] : state.players.map((p) => p.id),
              pairs: isPairMode
                ? state.pairs.map((p) => ({ p1: p.p1.id, p2: p.p2.id }))
                : undefined,
              // Offline → força 'ativo' para o servidor gerar as partidas ao
              // sincronizar (a Liga provisória já está em uso com placares).
              status: offlineNow ? 'ativo' : state.status,
            },
          }
        }

        const result = await submitCreation({ kind: 'campeonato', op, snapshot })
        if ('error' in result) throw new Error(result.error)

        // Offline → tenta criar um snapshot local "provisório" utilizável na hora
        // (abre direto a tela provisória). Se conseguir, retorna; senão cai no card.
        if (result.queued) {
          // Helpers de info de participante (jogador ou dupla)
          const pairName = (p: PairEntry) =>
            `${p.p1.full_name?.split(' ')[0] ?? '?'} / ${p.p2.full_name?.split(' ')[0] ?? '?'}`

          if (state.format === 'liga') {
            const allowDrawL = state.counting === 'tempo' || state.setDrawEnabled
            const participantsInfo = isPairMode
              ? state.pairs.map((p) => ({ userIds: [p.p1.id, p.p2.id], name: pairName(p), avatarUrl: null as string | null }))
              : state.players.map((p) => ({ userIds: [p.id], name: p.full_name, avatarUrl: p.avatar_url }))
            await saveLocalChampionship(
              buildLocalLiga(result.id, {
                name: state.name,
                startDate: state.startDate || null,
                unit: isPairMode ? 'pair' : 'player',
                stage: {
                  counting: state.counting,
                  points_per_set: state.pointsPerSet,
                  win_by_two: state.winByTwo,
                  set_draw_enabled: state.setDrawEnabled,
                  sets_to_play: state.setsToPlay,
                },
                rounds: state.rounds,
                champ: {
                  pointsWin: state.pointsWin,
                  pointsDraw: allowDrawL ? state.pointsDraw : 0,
                  pointsLoss: state.pointsLoss,
                  tiebreakers: state.tiebreakers,
                },
                participants: participantsInfo,
              }),
            )
            router.push(`/pendentes/${result.id}`)
            return
          }

          if (state.format === 'eliminatoria') {
            // Eliminatória nunca tem empate (espelha o servidor).
            const elimStageCfg = {
              counting: state.counting,
              points_per_set: state.pointsPerSet,
              win_by_two: state.winByTwo,
              set_draw_enabled: false,
              sets_to_play: state.setsToPlay,
            }
            const participantsInfo = isPairMode
              ? state.pairs.map((p) => ({
                  userIds: [p.p1.id, p.p2.id],
                  name: pairName(p),
                  avatarUrl: null as string | null,
                  seed: state.pairSeeds[p.id] ?? null,
                }))
              : state.players.map((p) => ({
                  userIds: [p.id],
                  name: p.full_name,
                  avatarUrl: p.avatar_url,
                  seed: state.playerSeeds[p.id] ?? null,
                }))
            await saveLocalChampionship(
              buildLocalEliminatoria(result.id, {
                name: state.name,
                startDate: state.startDate || null,
                unit: isPairMode ? 'pair' : 'player',
                stage: elimStageCfg,
                champ: {
                  pointsWin: state.pointsWin,
                  pointsDraw: 0,
                  pointsLoss: state.pointsLoss,
                  tiebreakers: state.tiebreakers,
                },
                hasThirdPlace: state.hasThirdPlace,
                participants: participantsInfo,
              }),
            )
            router.push(`/pendentes/${result.id}`)
            return
          }

          if (state.format === 'grupos_elim') {
            // Resolve o groupIndex de cada participante igual ao servidor:
            // - jogadores: snake draft sobre a ordem enviada (groups.flat())
            // - duplas: groupIndex explícito (manual ou snake)
            type PInfo = { userIds: string[]; name: string | null; avatarUrl: string | null; seed: number | null; groupIndex: number }
            let participantsInfo: PInfo[]
            if (isPairMode) {
              const pairAssign = state.manualPairGroupAssign ?? computeSnakeDraftPairs(state.pairs, state.numGroups)
              participantsInfo = state.pairs.map((p) => ({
                userIds: [p.p1.id, p.p2.id],
                name: pairName(p),
                avatarUrl: null,
                seed: state.pairSeeds[p.id] ?? null,
                groupIndex: pairAssign[p.id] ?? 0,
              }))
            } else {
              const assignments = state.manualGroupAssign ?? computeSnakeDraft(state.players, state.numGroups)
              const grouped = groupPlayersByAssignment(state.players, assignments, state.numGroups)
              const orderedPlayers = grouped.flat()
              const serverAssign = computeSnakeDraft(orderedPlayers, state.numGroups)
              participantsInfo = orderedPlayers.map((p) => ({
                userIds: [p.id],
                name: p.full_name,
                avatarUrl: p.avatar_url,
                seed: state.playerSeeds[p.id] ?? null,
                groupIndex: serverAssign[p.id] ?? 0,
              }))
            }

            // Total de classificados PAR? (ceil(size/2) por grupo). Ímpar → repescagem
            // (fora do escopo offline): mantém só o card pendente.
            const sizes = Array.from({ length: state.numGroups }, () => 0)
            for (const p of participantsInfo) sizes[p.groupIndex] = (sizes[p.groupIndex] ?? 0) + 1
            const totalQ = sizes.reduce((s, sz) => s + qualifiersPerGroup(sz), 0)

            if (totalQ % 2 === 0 && totalQ >= 2) {
              const allowDrawG = state.groupsCounting === 'tempo' || state.groupsSetDrawEnabled
              await saveLocalChampionship(
                buildLocalGrupos(result.id, {
                  name: state.name,
                  startDate: state.startDate || null,
                  unit: isPairMode ? 'pair' : 'player',
                  groupsStage: {
                    counting: state.groupsCounting,
                    points_per_set: state.groupsPointsPerSet,
                    win_by_two: state.groupsWinByTwo,
                    set_draw_enabled: state.groupsSetDrawEnabled,
                    sets_to_play: state.groupsSetsToPlay,
                  },
                  elimStage: {
                    counting: state.counting,
                    points_per_set: state.pointsPerSet,
                    win_by_two: state.winByTwo,
                    set_draw_enabled: false,
                    sets_to_play: state.setsToPlay,
                  },
                  champ: {
                    pointsWin: state.pointsWin,
                    pointsDraw: allowDrawG ? state.pointsDraw : 0,
                    pointsLoss: state.pointsLoss,
                    tiebreakers: state.tiebreakers,
                  },
                  hasThirdPlace: state.hasThirdPlace,
                  numGroups: state.numGroups,
                  rounds: state.groupsRounds,
                  participants: participantsInfo,
                }),
              )
              router.push(`/pendentes/${result.id}`)
              return
            }
            // totalQ ímpar → cai no card pendente abaixo.
          }
        }

        // Offline → vai para a lista (card pendente); online → detalhe do campeonato.
        router.push(result.queued ? '/campeonatos' : `/campeonatos/${result.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao criar campeonato.')
      }
    })
  }

  const isBlocked =
    (state.format !== 'liga' &&
      state.format !== 'eliminatoria' &&
      state.format !== 'grupos_elim' &&
      state.format !== 'desafio') ||
    (state.format !== 'desafio' &&
      state.unit !== 'player' &&
      state.unit !== 'pair')

  const canGoForward = canAdvance(step, state)

  const stepTitle = (() => {
    const defaults = [
      'Dados básicos',
      state.format === 'eliminatoria'
        ? 'Config. eliminatória'
        : state.format === 'grupos_elim'
          ? 'Config. dos grupos'
          : 'Configuração da liga',
      'Contagem e pontuação',
      'Participantes',
      'Revisão',
    ]
    return defaults[step - 1]
  })()

  // Offset do sticky CTA: online tem tab-bar fixa, offline não tem.
  const ctaBottom = isOffline
    ? 'max(1rem, env(safe-area-inset-bottom))'
    : 'max(8rem, calc(7rem + env(safe-area-inset-bottom)))'

  return (
    <div>
      {/* Step header — compacto */}
      <div className="px-5 pt-3 pb-2 space-y-2">
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
            <p className="text-sm font-semibold text-white">{stepTitle}</p>
          </div>
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
        <div className="h-0.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-secondary transition-all duration-300 ease-out"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="px-5 pb-4 space-y-0">
        {step === 1 && <Step1 state={state} onChange={onChange} />}
        {step === 2 && state.format === 'eliminatoria' && (
          <Step2Eliminatoria state={state} onChange={onChange} />
        )}
        {step === 2 && state.format === 'grupos_elim' && (
          <Step2GruposElim state={state} onChange={onChange} />
        )}
        {step === 2 && state.format !== 'eliminatoria' && state.format !== 'grupos_elim' && (
          <Step2Liga state={state} onChange={onChange} />
        )}
        {step === 3 && <Step3 state={state} onChange={onChange} />}
        {step === 4 && state.unit === 'pair'   && <Step4Pairs state={state} onChange={onChange} />}
        {step === 4 && state.unit !== 'pair'   && <Step4 state={state} onChange={onChange} />}
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

      {/* CTA sticky — sempre visível acima da tab-bar */}
      {step < 5 && (
        <div
          className="sticky z-20 -mx-0 px-5 pt-8 pointer-events-none"
          style={{
            bottom: ctaBottom,
            background: 'linear-gradient(to top, #16233a 55%, #16233a99 78%, transparent)',
            paddingBottom: isOffline
              ? 'max(0.75rem, env(safe-area-inset-bottom))'
              : '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={next}
            disabled={!canGoForward || isBlocked}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 rounded-full bg-secondary py-3.5 text-base font-bold text-primary transition active:scale-[0.98] disabled:opacity-35"
          >
            Avançar
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}
