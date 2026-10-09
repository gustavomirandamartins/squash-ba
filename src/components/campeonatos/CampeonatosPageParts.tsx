// Partes da tela Campeonatos usadas online (página do servidor) e offline
// (shell, com o que está no aparelho) — as duas versões ficam iguais.

import Link from 'next/link'
import { Plus, Trophy, Swords } from 'lucide-react'

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: 'Aguardando',   cls: 'bg-yellow-500/15 text-yellow-400/70' },
  ativo:     { label: 'Em andamento', cls: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado',    cls: 'bg-white/5 text-white/30' },
}

export type ChallengeEntry = { id: string; name: string; status: string }

export function CampeonatosHeader() {
  return (
    <div className="flex items-center justify-between">
      <h1 className="flex items-center gap-2 font-display text-lg font-bold text-white">
        <Trophy className="h-5 w-5 text-secondary" />
        Campeonatos
      </h1>
      <Link
        href="/campeonatos/novo"
        className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-primary transition active:scale-95"
      >
        <Plus className="h-4 w-4" />
        Criar
      </Link>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">{children}</p>
      <div className="flex-1 h-px bg-white/8" />
    </div>
  )
}

/** "Meus desafios" — some quando não há nenhum. */
export function MyChallengesSection({ desafios }: { desafios: ChallengeEntry[] }) {
  if (desafios.length === 0) return null
  return (
    <section className="space-y-2">
      <SectionLabel>Meus desafios</SectionLabel>
      {desafios.map((d) => {
        const st = STATUS_LABEL[d.status] ?? STATUS_LABEL.rascunho
        return (
          <Link
            key={d.id}
            href={`/desafios/${d.id}`}
            className="glass glass-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.985]"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/12">
              <Swords className="h-4 w-4 text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{d.name}</p>
              <p className="mt-0.5 text-xs text-white/40">Desafio</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${st.cls}`}>
              {st.label}
            </span>
          </Link>
        )
      })}
    </section>
  )
}

/** Rótulo "Campeonatos" acima da lista, quando há desafios em cima. */
export function ChampionshipsLabel({ show }: { show: boolean }) {
  return show ? <SectionLabel>Campeonatos</SectionLabel> : null
}

export function NoChampionships({ text = 'Nenhum campeonato ainda.' }: { text?: string }) {
  return (
    <div className="glass glass-card flex flex-col items-center gap-3 py-14 text-center">
      <Trophy className="h-10 w-10 text-secondary/30" />
      <p className="text-sm text-white/40">{text}</p>
      <Link
        href="/campeonatos/novo"
        className="rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-primary transition active:scale-95"
      >
        Criar primeiro campeonato
      </Link>
    </div>
  )
}
