'use client'

// Visualizador de campeonato "provisório" (criado offline, ainda não sincronizado).
// Suporta Liga (round-robin), Eliminatória (bracket / triangular), Grupos+Elim
// (grupos → bracket) e Desafio de duplas / por times (com final). Recebe o
// tempId por prop — usado em /pendentes/[tempId].

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppRouter } from '@/lib/offline/use-app-router'
import Link from 'next/link'
import {
  ChevronLeft, CloudOff, Loader2, AlertTriangle, Trash2, User,
} from 'lucide-react'
import { getOutbox, removeFromOutbox, updateOutbox, OUTBOX_EVENT } from '@/lib/offline/outbox'
import type { OutboxItem } from '@/lib/offline/types'
import {
  getLocalChampionship, removeLocalChampionship, mutateLocalChampionship,
  propagateBracketAdvances, maybeGenerateBracketFromGroups,
  syncTeamFinal, isTeamFinal, desafioStandings,
  type LocalChampionship, type LocalMatch,
} from '@/lib/offline/local-championship'
import { takeLocalSynced } from '@/lib/offline/reconcile-liga'
import { aggregateTeamStandings, computeStandings, resolveMatch, type StageCfg } from '@/lib/standings/compute'
import { StandingsGrid, type Standing } from '@/components/campeonatos/StandingsTable'
import { LocalScoreScreen } from '@/components/score/LocalScoreScreen'
import { LocalBracketView } from '@/components/offline/LocalBracketView'
import { groupLabel } from '@/lib/group-label'

type SideInfo = { name: string | null; avatarUrl: string | null }

export function ProvisionalChampionship({ tempId }: { tempId: string }) {
  const router = useAppRouter()

  const [item, setItem] = useState<OutboxItem | null>(null)
  const [champ, setChamp] = useState<LocalChampionship | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<'jogos' | 'classificacao' | 'grupos' | 'chave'>('jogos')
  const [openMatchId, setOpenMatchId] = useState<string | null>(null)
  // Lembra se é desafio: ao sincronizar, item e snapshot somem antes do redirect.
  const isDesafioRef = useRef(false)

  const reload = useCallback(async () => {
    const [all, c] = await Promise.all([getOutbox(), getLocalChampionship(tempId)])
    const found = all.find((i) => i.tempId === tempId) ?? null
    if (found?.kind === 'desafio' || c?.format === 'desafio') isDesafioRef.current = true
    if (!found && !c) {
      const realId = await takeLocalSynced(tempId)
      if (realId) {
        router.replace(`${isDesafioRef.current ? '/desafios' : '/campeonatos'}/${realId}`)
        return
      }
    }
    setItem(found)
    setChamp(c)
    setLoaded(true)
  }, [tempId, router])

  useEffect(() => {
    void reload()
    const onChange = () => void reload()
    window.addEventListener(OUTBOX_EVENT, onChange)
    return () => window.removeEventListener(OUTBOX_EVENT, onChange)
  }, [reload])

  const isDesafio = item?.kind === 'desafio' || champ?.format === 'desafio'
  const backHref = isDesafio ? '/desafios' : '/campeonatos'

  async function cancel() {
    await removeFromOutbox(tempId)
    await removeLocalChampionship(tempId)
    router.push(backHref)
  }

  async function retry() {
    await updateOutbox(tempId, { status: 'pending', error: undefined })
  }

  // Fecha o placar: propaga avanços de bracket / gera bracket dos grupos, persiste.
  const closeMatch = useCallback(async () => {
    setOpenMatchId(null)
    // Numa transação: corrige a chave (vencedor trocado/partida reaberta) e
    // gera/refaz a chave dos grupos.
    await mutateLocalChampionship(tempId, (c) => {
      if (c.format === 'eliminatoria' || c.format === 'grupos_elim') propagateBracketAdvances(c)
      if (c.format === 'grupos_elim') {
        if (maybeGenerateBracketFromGroups(c)) propagateBracketAdvances(c)
      }
      // Desafio por times: com todos os jogos encerrados, gera (ou refaz) a final.
      if (c.format === 'desafio') syncTeamFinal(c)
    })
    await reload()
  }, [tempId, reload])

  // ── Loading / vazio ────────────────────────────────────────────────────────
  if (loaded && !item && !champ) {
    return (
      <div className="px-5 py-8 space-y-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="glass glass-card px-4 py-10 text-center space-y-1.5">
          <p className="text-sm font-medium text-white/60">Item já sincronizado</p>
          <p className="text-xs text-white/35">
            Esta criação já foi enviada. Procure na lista de campeonatos ou jogos.
          </p>
        </div>
      </div>
    )
  }

  // ── Visualizador provisório (snapshot local) ───────────────────────────────
  if (champ) {
    const nameById = new Map<string, SideInfo>(
      champ.participants.map((p) => [p.id, { name: p.name, avatarUrl: p.avatarUrl }]),
    )

    // Config de placar de uma partida (grupos usam stage; bracket usa elimStage).
    const stageForMatch = (m: LocalMatch): StageCfg =>
      champ.format === 'grupos_elim' && m.phase === 'eliminatoria'
        ? champ.elimStage ?? champ.stage
        : champ.stage

    // ── Sub-tela de placar ──
    if (openMatchId) {
      const m = champ.matches.find((x) => x.id === openMatchId)
      if (m) {
        const a = m.sideA ? nameById.get(m.sideA) : null
        const b = m.sideB ? nameById.get(m.sideB) : null
        return (
          <div className="px-5 py-4">
            <LocalScoreScreen
              tempId={tempId}
              matchId={m.id}
              sideA={{ name: a?.name ?? null, avatarUrl: a?.avatarUrl ?? null }}
              sideB={{ name: b?.name ?? null, avatarUrl: b?.avatarUrl ?? null }}
              stage={stageForMatch(m)}
              onBack={() => void closeMatch()}
            />
          </div>
        )
      }
    }

    const isElimBracket =
      champ.format === 'eliminatoria' && champ.matches.some((m) => (m.bracketSlot ?? 0) > 0)
    const isGrupos = champ.format === 'grupos_elim'
    // Eliminatória triangular (N=3): sem bracket → exibe como Liga. Desafio também.
    const isLigaLike =
      champ.format === 'liga' || champ.format === 'desafio' || (champ.format === 'eliminatoria' && !isElimBracket)
    const isTeams = champ.format === 'desafio' && champ.unit === 'team'
    const teamFinal = champ.matches.find(isTeamFinal) ?? null
    const mainMatches = teamFinal ? champ.matches.filter((m) => !isTeamFinal(m)) : champ.matches

    // Tabs por formato
    const tabs: { key: typeof tab; label: string }[] = isGrupos
      ? [
          { key: 'jogos', label: 'Jogos' },
          { key: 'grupos', label: 'Grupos' },
          { key: 'chave', label: 'Chave' },
        ]
      : isElimBracket
        ? [{ key: 'chave', label: 'Chave' }]
        : [
            { key: 'jogos', label: 'Jogos' },
            { key: 'classificacao', label: 'Classificação' },
          ]
    const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0].key

    const unitWord = champ.unit === 'pair' ? 'duplas' : 'jogadores'
    const formatLabel =
      champ.format === 'liga'
        ? 'Liga'
        : champ.format === 'eliminatoria'
          ? 'Eliminatória'
          : champ.format === 'desafio'
            ? isTeams
              ? `Desafio ${champ.teams?.[0]?.name ?? ''} × ${champ.teams?.[1]?.name ?? ''}`
              : 'Desafio de duplas'
            : 'Grupos + Elim.'

    // ── Helpers de render ──
    const avatarById = Object.fromEntries(champ.participants.map((p) => [p.id, p.avatarUrl]))
    const renderStandings = (standings: Standing[]) => (
      <div className="space-y-2">
        <div className="glass glass-card overflow-hidden">
          <StandingsGrid
            standings={standings}
            currentUserParticipantId={null}
            participantAvatars={avatarById}
          />
        </div>
        <p className="px-1 text-[10px] leading-relaxed text-white/18">
          Pts = pontos · J = partidas · V/E/D = vitória/empate/derrota · SG/SP = sets vencidos/perdidos · PF/PC = pontos a favor/contra · Saldo = PF − PC
        </p>
      </div>
    )

    const renderMatchRow = (m: LocalMatch) => {
      const a = m.sideA ? nameById.get(m.sideA) : null
      const b = m.sideB ? nameById.get(m.sideB) : null
      const res = resolveMatch(m.games, stageForMatch(m))
      return (
        <button
          key={m.id}
          onClick={() => setOpenMatchId(m.id)}
          className="glass glass-card w-full flex items-center gap-3 px-4 py-3 text-left transition active:scale-[0.985]"
        >
          <MatchSide info={a} winner={m.result === 'lado_a'} />
          <div className="shrink-0 text-center min-w-[3rem]">
            {res.finalized || m.games.length > 0 ? (
              <span className="text-sm font-black tabular-nums text-white/80">
                {res.setsA}<span className="text-white/25 mx-0.5">×</span>{res.setsB}
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/20">vs</span>
            )}
            <p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/25">
              {m.status === 'finalizado' ? 'fim' : m.games.length > 0 ? 'ao vivo' : 'agendado'}
            </p>
          </div>
          <MatchSide info={b} winner={m.result === 'lado_b'} alignRight />
        </button>
      )
    }

    // Jogos agrupados por rodada (liga/triangular)
    const renderJogosByRound = (matches: LocalMatch[]) => {
      const byRound = new Map<number, LocalMatch[]>()
      for (const m of matches) {
        const arr = byRound.get(m.round) ?? []
        arr.push(m)
        byRound.set(m.round, arr)
      }
      const rounds = [...byRound.keys()].sort((x, y) => x - y)
      return (
        <div className="space-y-4">
          {rounds.map((r) => (
            <div key={r} className="space-y-2">
              {rounds.length > 1 && (
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 px-1">Rodada {r}</p>
              )}
              {byRound.get(r)!.map(renderMatchRow)}
            </div>
          ))}
        </div>
      )
    }

    const ligaStandings = () =>
      champ.format === 'desafio'
        ? desafioStandings(champ)
        : computeStandings(
            champ.matches.map((m) => ({ side_a_participant_id: m.sideA, side_b_participant_id: m.sideB, games: m.games })),
            champ.participants.map((p) => ({ id: p.id, name: p.name })),
            champ.stage,
            champ.champ,
          )

    // Desafio por times: placar por time + individual
    const renderTeamStandings = () => {
      const individual = desafioStandings(champ)
      const teamOf = new Map<string, string>()
      for (const t of champ.teams ?? []) for (const pid of t.participantIds) teamOf.set(pid, t.id)
      const byTeam = aggregateTeamStandings(individual, champ.teams ?? [], (id) => teamOf.get(id))
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-secondary/70 px-1">Por time</p>
            {renderStandings(byTeam)}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-secondary/70 px-1">Jogadores</p>
            {renderStandings(individual)}
          </div>
        </div>
      )
    }

    return (
      <div className="px-5 py-4 space-y-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">{champ.name}</h1>
            <span className="shrink-0 rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-bold text-secondary">
              Provisório
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/40">
            {item?.status === 'syncing' ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Sincronizando…</>
            ) : item?.status === 'error' ? (
              <><AlertTriangle className="h-3 w-3 text-red-400" /> Falha ao sincronizar</>
            ) : (
              <><CloudOff className="h-3 w-3 text-yellow-400/80" /> {formatLabel} · {champ.participants.length} {unitWord} · será sincronizado ao reconectar</>
            )}
          </p>
        </div>

        {item?.status === 'error' && item.error && (
          <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-xs text-red-300">{item.error}</p>
        )}

        {/* Tabs (oculta quando há só uma) */}
        {tabs.length > 1 && (
          <div className="glass glass-pill p-1 flex gap-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all ${
                  activeTab === t.key ? 'bg-secondary text-primary' : 'text-white/40 hover:text-white/65'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Conteúdo ── */}
        {isLigaLike && activeTab === 'jogos' && (
          <div className="space-y-4">
            {renderJogosByRound(mainMatches)}
            {teamFinal && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-secondary/70 px-1">Final</p>
                {renderMatchRow(teamFinal)}
              </div>
            )}
            {isTeams && champ.hasFinal && !teamFinal && (
              <p className="px-1 text-[11px] leading-relaxed text-white/35">
                A final (melhor jogador de cada time) aparece aqui quando todos os jogos terminarem.
              </p>
            )}
          </div>
        )}
        {isLigaLike && activeTab === 'classificacao' &&
          (isTeams ? renderTeamStandings() : renderStandings(ligaStandings()))}

        {isElimBracket && (
          <LocalBracketView
            matches={champ.matches}
            nameById={nameById}
            stage={champ.stage}
            onOpenMatch={(id) => setOpenMatchId(id)}
          />
        )}

        {isGrupos && activeTab === 'jogos' && (
          <div className="space-y-5">
            {(champ.groups ?? []).map((g) => {
              const gms = champ.matches.filter((m) => m.phase === 'grupos' && m.groupId === g.id)
              if (gms.length === 0) return null
              return (
                <div key={g.id} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-secondary/70 px-1">{groupLabel(g.name)}</p>
                  {gms.map(renderMatchRow)}
                </div>
              )
            })}
          </div>
        )}

        {isGrupos && activeTab === 'grupos' && (
          <div className="space-y-5">
            {(champ.groups ?? []).map((g) => {
              const ids = new Set(g.participantIds)
              const standings = computeStandings(
                champ.matches
                  .filter((m) => m.phase === 'grupos' && m.groupId === g.id)
                  .map((m) => ({ side_a_participant_id: m.sideA, side_b_participant_id: m.sideB, games: m.games })),
                champ.participants.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name })),
                champ.stage,
                champ.champ,
              )
              return (
                <div key={g.id} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-secondary/70 px-1">{groupLabel(g.name)}</p>
                  {renderStandings(standings)}
                </div>
              )
            })}
          </div>
        )}

        {isGrupos && activeTab === 'chave' && (
          <LocalBracketView
            matches={champ.matches}
            nameById={nameById}
            stage={champ.elimStage ?? champ.stage}
            onOpenMatch={(id) => setOpenMatchId(id)}
          />
        )}

        {/* Descartar */}
        <button
          type="button"
          onClick={() => void cancel()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 py-3 text-sm font-semibold text-red-300 transition active:scale-95 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
          {champ.format === 'desafio' ? 'Descartar desafio' : 'Descartar campeonato'}
        </button>
      </div>
    )
  }

  // ── Fallback: card de status (criações sem snapshot local) ──────────────────
  return (
    <div className="px-5 py-4 space-y-4">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      {item && (
        <>
          <div className="glass glass-card px-5 py-6 text-center space-y-3">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06]">
              {item.status === 'syncing' ? (
                <Loader2 className="h-6 w-6 animate-spin text-secondary" />
              ) : item.status === 'error' ? (
                <AlertTriangle className="h-6 w-6 text-red-400" />
              ) : (
                <CloudOff className="h-6 w-6 text-yellow-400/80" />
              )}
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold tracking-tight text-white">{item.snapshot.name}</h1>
              <p className="mt-1 text-sm text-white/45">{item.snapshot.subtitle}</p>
            </div>
            <p className="text-xs leading-relaxed text-white/40 max-w-xs mx-auto">
              {item.status === 'syncing'
                ? 'Enviando para o servidor…'
                : item.status === 'error'
                  ? 'Não foi possível criar. Tente novamente quando estiver online.'
                  : 'Criado offline. Será enviado automaticamente assim que você reconectar.'}
            </p>
          </div>

          {item.status === 'error' && item.error && (
            <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-xs text-red-300">{item.error}</p>
          )}

          <div className="flex gap-2">
            {item.status === 'error' && (
              <button
                type="button"
                onClick={() => void retry()}
                className="flex-1 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-95"
              >
                Tentar novamente
              </button>
            )}
            <button
              type="button"
              onClick={() => void cancel()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 py-3 text-sm font-semibold text-red-300 transition active:scale-95 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Lado de uma partida (avatar + nome) — usado nas listas de jogos.
function MatchSide({
  info,
  winner,
  alignRight,
}: {
  info: SideInfo | null | undefined
  winner: boolean
  alignRight?: boolean
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${alignRight ? 'flex-row-reverse text-right' : ''}`}>
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-secondary/10 ring-1 ring-white/10 grid place-items-center">
        {info?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-4 w-4 text-secondary/50" />
        )}
      </div>
      <span className={`truncate text-sm font-medium ${winner ? 'text-secondary' : 'text-white/80'}`}>
        {info?.name ?? '—'}
      </span>
    </div>
  )
}
