'use client'

import { useState, useEffect, useTransition } from 'react'
import { useAppRouter } from '@/lib/offline/use-app-router'
import Image from 'next/image'
import Link from 'next/link'
import { loadPlayerPool, loadTeamsWithRosters } from '@/lib/offline/players-cache'
import {
  buildLocalDesafioDuplas, buildLocalDesafioTimes, saveLocalChampionship, type LocalChampionship,
} from '@/lib/offline/local-championship'
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
import type { ChallengeConfig } from '@/app/(app)/desafios/actions'
import { submitCreation } from '@/lib/offline/submit'
import type { CreationOp } from '@/lib/offline/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChallengeType = '1v1' | 'duplas' | 'teams'

interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

interface WizardState extends ChallengeConfig {
  type: ChallengeType | null
  opponent: Profile | null
  // Duplas (2v2)
  partner: Profile | null
  opp1: Profile | null
  opp2: Profile | null
  // Times (NxN)
  totalPlayers: number
  hasFinal: boolean
  teamAId: string | null
  teamAName: string | null
  teamAPlayerIds: string[]
  teamBId: string | null
  teamBName: string | null
  teamBPlayerIds: string[]
}

type Patch = Partial<WizardState>

// ─── Desafio provisório (criado offline) ─────────────────────────────────────

const firstName = (n: string | null | undefined) => n?.split(' ')[0] ?? '?'

async function buildOfflineDesafio(
  tempId: string,
  op: CreationOp,
  state: WizardState,
  me: string,
): Promise<LocalChampionship | null> {
  const allowDraw = state.counting === 'tempo' || state.setDrawEnabled
  const common = {
    name: state.name.trim(),
    rounds: state.rounds,
    stage: {
      counting: state.counting,
      points_per_set: state.pointsPerSet,
      win_by_two: state.winByTwo,
      set_draw_enabled: state.setDrawEnabled,
      sets_to_play: state.setsToPlay,
    },
    champ: {
      pointsWin: state.pointsWin,
      pointsDraw: allowDraw ? state.pointsDraw : 0,
      pointsLoss: state.pointsLoss,
      tiebreakers: state.tiebreakers,
    },
  }

  if (op.type === 'desafio_duplas') {
    // Você + parceiro × dupla adversária.
    if (!me || !state.partner || !state.opp1 || !state.opp2) return null
    const myName = (await loadPlayerPool()).find((p) => p.id === me)?.full_name ?? 'Você'
    return buildLocalDesafioDuplas(tempId, {
      ...common,
      pairs: [
        { userIds: [me, state.partner.id], name: `${firstName(myName)} / ${firstName(state.partner.full_name)}`, avatarUrl: null },
        { userIds: [state.opp1.id, state.opp2.id], name: `${firstName(state.opp1.full_name)} / ${firstName(state.opp2.full_name)}`, avatarUrl: null },
      ],
    })
  }

  if (op.type === 'desafio_times') {
    const { roster } = await loadTeamsWithRosters()
    const byId = new Map(roster.map((p) => [p.id, p]))
    const players = (ids: string[]) =>
      ids.map((id) => ({
        userIds: [id],
        name: byId.get(id)?.full_name ?? null,
        avatarUrl: byId.get(id)?.avatar_url ?? null,
      }))
    return buildLocalDesafioTimes(tempId, {
      ...common,
      hasFinal: op.hasFinal,
      teams: [
        { teamId: op.teamA.teamId, name: op.teamA.name, players: players(op.teamA.playerIds) },
        { teamId: op.teamB.teamId, name: op.teamB.name, players: players(op.teamB.playerIds) },
      ],
    })
  }

  return null
}

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
  venueId: null,
  opponent: null,
  partner: null,
  opp1: null,
  opp2: null,
  totalPlayers: 2,
  hasFinal: false,
  teamAId: null,
  teamAName: null,
  teamAPlayerIds: [],
  teamBId: null,
  teamBName: null,
  teamBPlayerIds: [],
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
        onClick={() => onSelect('duplas')}
        className="glass glass-card w-full flex items-start gap-4 px-5 py-5 text-left transition active:scale-[0.97] hover:border-secondary/30"
      >
        <div className="h-11 w-11 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
          <Users className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-white">Desafio de Duplas</p>
          <p className="text-sm text-white/45 mt-0.5 leading-snug">
            2 vs 2. Você monta as duas duplas (você + parceiro vs dupla adversária).
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-white/25 shrink-0 mt-0.5" />
      </button>

      <button
        type="button"
        onClick={() => onSelect('teams')}
        className="glass glass-card w-full flex items-start gap-4 px-5 py-5 text-left transition active:scale-[0.97] hover:border-secondary/30"
      >
        <div className="h-11 w-11 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
          <Users className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-white">Desafio por Times</p>
          <p className="text-sm text-white/45 mt-0.5 leading-snug">
            NxN entre dois times. Jogos cruzados, classificação individual e por equipe.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-white/25 shrink-0 mt-0.5" />
      </button>
    </div>
  )
}

// ─── ConfigFields (compartilhado: nome, partidas, contagem, pontuação, desempate) ─

type VenueOption = { id: string; name: string }

function ConfigFields({
  state,
  onChange,
  venues = [],
}: {
  state: WizardState
  onChange: (p: Patch) => void
  venues?: VenueOption[]
}) {
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
      {/* Nome */}
      <div className="glass glass-card px-4 py-3.5 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Nome do desafio
        </p>
        <input
          autoFocus
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ex.: Desafio de sábado"
          className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
      </div>

      {/* Local (opcional) */}
      {venues.length > 0 && (
        <div className="glass glass-card px-4 py-3.5 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Local{' '}
            <span className="normal-case font-normal text-white/25">(opcional)</span>
          </p>
          <select
            value={state.venueId ?? ''}
            onChange={(e) => onChange({ venueId: e.target.value || null })}
            className="w-full bg-transparent text-sm text-white outline-none [color-scheme:dark]"
          >
            <option value="" className="bg-primary">Sem local definido</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id} className="bg-primary">{v.name}</option>
            ))}
          </select>
        </div>
      )}

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
    </div>
  )
}

// ─── PlayerSearchPicker (seleciona 1 jogador, com exclusões) ───────────────────

function PlayerSearchPicker({
  label,
  selected,
  onSelect,
  onClear,
  excludeIds,
}: {
  label: string
  selected: Profile | null
  onSelect: (p: Profile) => void
  onClear: () => void
  excludeIds: string[]
}) {
  const [query, setQuery] = useState('')
  const [pool, setPool] = useState<Profile[]>([])
  const [searching, setSearching] = useState(true)

  // Carrega o pool uma vez (online busca e cacheia; offline lê o snapshot).
  useEffect(() => {
    loadPlayerPool().then((data) => {
      setPool(data.map((p) => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url })))
      setSearching(false)
    })
  }, [])

  // Filtro client-side por nome (funciona offline).
  const q = query.trim().toLowerCase()
  const filtered =
    q.length < 2
      ? []
      : pool
          .filter(
            (p) =>
              !excludeIds.includes(p.id) &&
              (p.full_name ?? '').toLowerCase().includes(q),
          )
          .slice(0, 10)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 px-1">{label}</p>
      {selected ? (
        <div className="glass glass-card flex items-center gap-3 px-4 py-3">
          <PlayerAvatar profile={selected} size={36} />
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white">
            {selected.full_name ?? 'Sem nome'}
          </span>
          <button
            type="button"
            onClick={onClear}
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
          {searching && <p className="text-center text-xs text-white/35 py-2">Buscando…</p>}
          {!searching && query.trim().length >= 2 && filtered.length === 0 && (
            <p className="text-center text-xs text-white/35 py-2">Nenhum jogador disponível.</p>
          )}
          {!searching && filtered.length > 0 && (
            <div className="space-y-1.5">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onSelect(p); setQuery('') }}
                  className="glass glass-card w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition active:scale-[0.98]"
                >
                  <PlayerAvatar profile={p} size={32} />
                  <span className="flex-1 text-sm text-white/85">{p.full_name ?? 'Sem nome'}</span>
                  <span className="text-xs font-semibold text-secondary/80">Escolher</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Step 2: Configuração 1v1 ─────────────────────────────────────────────────

function Step2_1v1({
  state,
  onChange,
  currentUserId,
  venues,
}: {
  state: WizardState
  onChange: (p: Patch) => void
  currentUserId: string
  venues?: VenueOption[]
}) {
  return (
    <div className="space-y-4">
      <ConfigFields state={state} onChange={onChange} venues={venues} />
      <PlayerSearchPicker
        label="Oponente"
        selected={state.opponent}
        onSelect={(p) => onChange({ opponent: p })}
        onClear={() => onChange({ opponent: null })}
        excludeIds={[currentUserId]}
      />
    </div>
  )
}

// ─── Step 2: Configuração Duplas (2v2) ────────────────────────────────────────

function Step2_Duplas({
  state,
  onChange,
  currentUserId,
  venues,
}: {
  state: WizardState
  onChange: (p: Patch) => void
  currentUserId: string
  venues?: VenueOption[]
}) {
  const partnerId = state.partner?.id
  const opp1Id = state.opp1?.id
  const opp2Id = state.opp2?.id
  const baseExclude = [currentUserId, partnerId, opp1Id, opp2Id].filter(Boolean) as string[]

  return (
    <div className="space-y-4">
      <ConfigFields state={state} onChange={onChange} venues={venues} />

      <div className="glass glass-card px-4 py-3 text-xs text-white/45 leading-relaxed">
        Você monta as duas duplas. <span className="text-white/70">Sua dupla</span> = você + parceiro.
        A dupla adversária recebe os dois jogadores que você escolher. Todos entram confirmados.
      </div>

      <div className="space-y-1">
        <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-secondary/70">Sua dupla</p>
        <PlayerSearchPicker
          label="Seu parceiro"
          selected={state.partner}
          onSelect={(p) => onChange({ partner: p })}
          onClear={() => onChange({ partner: null })}
          excludeIds={baseExclude}
        />
      </div>

      <div className="space-y-3">
        <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-white/50">Dupla adversária</p>
        <PlayerSearchPicker
          label="Jogador 1"
          selected={state.opp1}
          onSelect={(p) => onChange({ opp1: p })}
          onClear={() => onChange({ opp1: null })}
          excludeIds={baseExclude}
        />
        <PlayerSearchPicker
          label="Jogador 2"
          selected={state.opp2}
          onSelect={(p) => onChange({ opp2: p })}
          onClear={() => onChange({ opp2: null })}
          excludeIds={baseExclude}
        />
      </div>
    </div>
  )
}

// ─── Step 2: Configuração Times (NxN) ─────────────────────────────────────────

interface RosterProfile extends Profile {
  team_id: string | null
}

function TeamSide({
  title,
  half,
  teams,
  rosters,
  selectedTeamId,
  selectedPlayerIds,
  excludeTeamId,
  onPickTeam,
  onTogglePlayer,
}: {
  title: string
  half: number
  teams: { id: string; name: string; count: number }[]
  rosters: Map<string, RosterProfile[]>
  selectedTeamId: string | null
  selectedPlayerIds: string[]
  excludeTeamId: string | null
  onPickTeam: (id: string, name: string) => void
  onTogglePlayer: (uid: string) => void
}) {
  const eligible = teams.filter((t) => t.count >= half && t.id !== excludeTeamId)
  const roster = selectedTeamId ? (rosters.get(selectedTeamId) ?? []) : []

  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-secondary/70">{title}</p>

      {/* Seletor de time */}
      <div className="glass glass-card px-2 py-1.5">
        <select
          value={selectedTeamId ?? ''}
          onChange={(e) => {
            const t = teams.find((x) => x.id === e.target.value)
            if (t) onPickTeam(t.id, t.name)
          }}
          className="w-full appearance-none bg-transparent px-2 py-2 text-sm text-white outline-none"
          style={{ colorScheme: 'dark' }}
        >
          <option value="" className="bg-[#1d2b45]">Selecionar time…</option>
          {eligible.map((t) => (
            <option key={t.id} value={t.id} className="bg-[#1d2b45]">
              {t.name} ({t.count} jogadores)
            </option>
          ))}
        </select>
      </div>

      {eligible.length === 0 && (
        <p className="px-1 text-xs text-white/35">
          Nenhum time com pelo menos {half} jogador{half > 1 ? 'es' : ''}.
        </p>
      )}

      {/* Jogadores do time */}
      {selectedTeamId && (
        <div className="space-y-1">
          <p className="px-1 text-[11px] text-white/45">
            Escolha {half} jogador{half > 1 ? 'es' : ''} ({selectedPlayerIds.length}/{half})
          </p>
          {roster.map((p) => {
            const checked = selectedPlayerIds.includes(p.id)
            const atLimit = selectedPlayerIds.length >= half && !checked
            return (
              <button
                key={p.id}
                type="button"
                disabled={atLimit}
                onClick={() => onTogglePlayer(p.id)}
                className={`glass glass-card w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition active:scale-[0.98] ${
                  checked ? 'ring-1 ring-secondary/50' : ''
                } ${atLimit ? 'opacity-35' : ''}`}
              >
                <PlayerAvatar profile={p} size={30} />
                <span className="flex-1 text-sm text-white/85">{p.full_name ?? 'Sem nome'}</span>
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border ${
                    checked ? 'border-secondary bg-secondary' : 'border-white/30'
                  }`}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Step2_Teams({ state, onChange, venues }: { state: WizardState; onChange: (p: Patch) => void; venues?: VenueOption[] }) {
  const [teams, setTeams] = useState<{ id: string; name: string; count: number }[]>([])
  const [rosters, setRosters] = useState<Map<string, RosterProfile[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const half = Math.floor(state.totalPlayers / 2)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Online busca e cacheia; offline lê o último snapshot (IndexedDB).
      const { teams: teamList, roster } = await loadTeamsWithRosters()
      if (cancelled) return
      const rosterMap = new Map<string, RosterProfile[]>()
      for (const p of roster as RosterProfile[]) {
        if (!p.team_id) continue
        const arr = rosterMap.get(p.team_id) ?? []
        arr.push(p)
        rosterMap.set(p.team_id, arr)
      }
      const teamRows = teamList.map((t) => ({
        id: t.id,
        name: t.name,
        count: rosterMap.get(t.id)?.length ?? 0,
      }))
      setRosters(rosterMap)
      setTeams(teamRows)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  function pickTeam(side: 'A' | 'B', id: string, name: string) {
    if (side === 'A') onChange({ teamAId: id, teamAName: name, teamAPlayerIds: [] })
    else onChange({ teamBId: id, teamBName: name, teamBPlayerIds: [] })
  }

  function togglePlayer(side: 'A' | 'B', uid: string) {
    const key = side === 'A' ? 'teamAPlayerIds' : 'teamBPlayerIds'
    const current = side === 'A' ? state.teamAPlayerIds : state.teamBPlayerIds
    const next = current.includes(uid)
      ? current.filter((x) => x !== uid)
      : current.length >= half
        ? current
        : [...current, uid]
    onChange({ [key]: next } as Patch)
  }

  return (
    <div className="space-y-4">
      <ConfigFields state={state} onChange={onChange} venues={venues} />

      {/* Total de jogadores */}
      <div className="glass glass-card px-4 py-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Total de jogadores
        </p>
        <div className="flex gap-1.5">
          {[2, 4, 6, 8, 10].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ totalPlayers: n, teamAPlayerIds: [], teamBPlayerIds: [] })}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition active:scale-95 ${
                state.totalPlayers === n ? 'bg-secondary text-primary' : 'bg-white/10 text-white/50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/35 leading-relaxed">
          {half} de cada time. Cada jogador enfrenta todos os jogadores do time adversário.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-xs text-white/35 py-4">Carregando times…</p>
      ) : teams.length === 0 ? (
        <div className="glass glass-card px-4 py-6 text-center text-sm text-white/40">
          Nenhum time cadastrado. Cadastre times e jogadores na área de Gestão.
        </div>
      ) : (
        <>
          <TeamSide
            title="Time 1"
            half={half}
            teams={teams}
            rosters={rosters}
            selectedTeamId={state.teamAId}
            selectedPlayerIds={state.teamAPlayerIds}
            excludeTeamId={state.teamBId}
            onPickTeam={(id, name) => pickTeam('A', id, name)}
            onTogglePlayer={(uid) => togglePlayer('A', uid)}
          />
          <TeamSide
            title="Time 2"
            half={half}
            teams={teams}
            rosters={rosters}
            selectedTeamId={state.teamBId}
            selectedPlayerIds={state.teamBPlayerIds}
            excludeTeamId={state.teamAId}
            onPickTeam={(id, name) => pickTeam('B', id, name)}
            onTogglePlayer={(uid) => togglePlayer('B', uid)}
          />
        </>
      )}

      {/* Final */}
      <div className="glass glass-card px-4 py-4">
        <Toggle
          label="Disputar final (melhor de cada time)"
          value={state.hasFinal}
          onChange={(v) => onChange({ hasFinal: v })}
        />
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
        <SummaryRow
          label="Tipo"
          value={
            state.type === 'duplas'
              ? 'Desafio de duplas (2v2)'
              : state.type === 'teams'
                ? `Desafio por times (${Math.floor(state.totalPlayers / 2)}v${Math.floor(state.totalPlayers / 2)})`
                : 'Desafio 1v1'
          }
        />
        <div className="h-px bg-white/8" />
        <SummaryRow label="Partidas" value={`${state.rounds} ${state.rounds === 1 ? 'partida' : 'partidas'}`} />
        <SummaryRow label="Contagem" value={countingDesc} />
        <SummaryRow
          label="Pontuação"
          value={`V ${state.pointsWin} · ${allowDraw ? `E ${state.pointsDraw} · ` : ''}D ${state.pointsLoss}`}
        />
        <div className="h-px bg-white/8" />
        {state.type === '1v1' && state.opponent && (
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
        {state.type === 'duplas' && (
          <div className="space-y-1.5">
            <SummaryRow
              label="Sua dupla"
              value={`Você + ${state.partner?.full_name ?? '?'}`}
            />
            <SummaryRow
              label="Adversários"
              value={`${state.opp1?.full_name ?? '?'} + ${state.opp2?.full_name ?? '?'}`}
            />
          </div>
        )}
        {state.type === 'teams' && (
          <div className="space-y-1.5">
            <SummaryRow label="Times" value={`${state.teamAName ?? '?'} × ${state.teamBName ?? '?'}`} />
            <SummaryRow label="Jogadores" value={`${state.teamAPlayerIds.length} × ${state.teamBPlayerIds.length}`} />
            <SummaryRow label="Final" value={state.hasFinal ? 'Sim (melhor de cada time)' : 'Não'} />
          </div>
        )}
      </div>

      <div className="glass glass-card px-4 py-3.5 flex items-start gap-3">
        <div className="h-5 w-5 rounded-full bg-secondary/20 grid place-items-center shrink-0 mt-0.5">
          <span className="text-[10px] font-bold text-secondary">!</span>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          {state.type === '1v1'
            ? 'O oponente receberá um convite. O desafio só começa após a aceitação.'
            : state.type === 'teams'
              ? 'Os jogos cruzados entre os times são gerados e o desafio começa imediatamente.'
              : 'As duas duplas já entram confirmadas e o desafio começa imediatamente.'}
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
    if (s.type === 'duplas') return !!(s.partner && s.opp1 && s.opp2)
    if (s.type === 'teams') {
      const half = Math.floor(s.totalPlayers / 2)
      return (
        !!s.teamAId && !!s.teamBId &&
        s.teamAId !== s.teamBId &&
        s.teamAPlayerIds.length === half &&
        s.teamBPlayerIds.length === half
      )
    }
    return true
  }
  return true
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface Props {
  currentUserId: string
  initialName?: string
  venues?: VenueOption[]
}

export function ChallengeWizard({ currentUserId, initialName = '', venues = [] }: Props) {
  const router = useAppRouter()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(() =>
    initialName ? { ...DEFAULT, name: initialName } : DEFAULT,
  )
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
    else router.push('/desafios')
  }

  function handleSubmit() {
    setError(null)
    const cfg: ChallengeConfig = {
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
      venueId: state.venueId ?? null,
    }
    startTransition(async () => {
      try {
        let op: CreationOp
        let subtitle: string

        if (state.type === '1v1') {
          if (!state.opponent) { setError('Selecione um oponente.'); return }
          op = { type: 'desafio_1v1', cfg, opponentId: state.opponent.id }
          subtitle = 'Desafio 1v1'
        } else if (state.type === 'duplas') {
          if (!state.partner || !state.opp1 || !state.opp2) {
            setError('Selecione seu parceiro e a dupla adversária.'); return
          }
          op = { type: 'desafio_duplas', cfg, partnerId: state.partner.id, opponentIds: [state.opp1.id, state.opp2.id] }
          subtitle = 'Desafio de duplas (2v2)'
        } else if (state.type === 'teams') {
          if (!state.teamAId || !state.teamBId || !state.teamAName || !state.teamBName) {
            setError('Selecione os dois times.'); return
          }
          op = {
            type: 'desafio_times',
            cfg,
            hasFinal: state.hasFinal,
            teamA: { teamId: state.teamAId, name: state.teamAName, playerIds: state.teamAPlayerIds },
            teamB: { teamId: state.teamBId, name: state.teamBName, playerIds: state.teamBPlayerIds },
          }
          subtitle = `Desafio por times (${state.teamAName} × ${state.teamBName})`
        } else {
          setError('Selecione o tipo de desafio.'); return
        }

        const result = await submitCreation({
          kind: 'desafio',
          op,
          snapshot: { name: state.name, subtitle },
        })
        if ('error' in result) { setError(result.error); return }

        // Offline: duplas e times já ficam jogáveis (desafio provisório, sobe
        // inteiro ao reconectar). O 1v1 depende do aceite do convite → card pendente.
        if (result.queued) {
          const local = await buildOfflineDesafio(result.id, op, state, currentUserId).catch(() => null)
          if (local) {
            await saveLocalChampionship(local)
            router.push(`/pendentes/${result.id}`)
            return
          }
          router.push('/desafios')
          return
        }
        router.push(`/desafios/${result.id}`)
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
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-6 space-y-0">
        {step === 1 && <Step1 onSelect={handleTypeSelect} />}
        {step === 2 && state.type === '1v1' && (
          <Step2_1v1 state={state} onChange={onChange} currentUserId={currentUserId} venues={venues} />
        )}
        {step === 2 && state.type === 'duplas' && (
          <Step2_Duplas state={state} onChange={onChange} currentUserId={currentUserId} venues={venues} />
        )}
        {step === 2 && state.type === 'teams' && (
          <Step2_Teams state={state} onChange={onChange} venues={venues} />
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
