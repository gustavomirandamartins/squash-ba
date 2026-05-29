import Link from 'next/link'
import { Trophy, Swords, ChevronRight } from 'lucide-react'

export interface LiveMatch {
  id: string
  href: string
  a: string
  b: string
  champName: string
}

export interface OngoingItem {
  id: string
  name: string
  isChallenge: boolean
  href: string
}

interface Props {
  liveMatches: LiveMatch[]
  active: OngoingItem[]
}

export function OngoingSection({ liveMatches, active }: Props) {
  if (liveMatches.length === 0 && active.length === 0) return null

  return (
    <section className="px-5">
      <h2 className="mb-3 font-display text-lg font-bold text-white">Acontecendo agora</h2>

      {liveMatches.length > 0 && (
        <div className="mb-3 space-y-2">
          {liveMatches.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className="glass glass-card flex items-center gap-3 px-4 py-3 transition active:scale-[0.985]"
            >
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="live-dot h-2 w-2 rounded-full bg-secondary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">ao vivo</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {m.a} <span className="text-white/30">vs</span> {m.b}
                </p>
                <p className="truncate text-xs text-white/40">{m.champName}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
            </Link>
          ))}
        </div>
      )}

      {active.length > 0 && (
        <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
          {active.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="glass glass-card flex w-[160px] shrink-0 flex-col gap-2 px-3.5 py-3.5 transition active:scale-[0.98]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary/12">
                {item.isChallenge ? (
                  <Swords className="h-4 w-4 text-secondary" />
                ) : (
                  <Trophy className="h-4 w-4 text-secondary" />
                )}
              </span>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{item.name}</p>
              <p className="text-[11px] text-white/40">{item.isChallenge ? 'Desafio' : 'Campeonato'}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
