import Image from 'next/image'
import { Trophy, Medal, User } from 'lucide-react'

export type PodiumPlace = {
  position: 1 | 2 | 3
  name: string | null
  avatarUrl: string | null
}

const MEDAL: Record<1 | 2 | 3, { ring: string; text: string; bg: string; label: string }> = {
  1: { ring: 'ring-yellow-400/40',  text: 'text-yellow-400',  bg: 'bg-yellow-400/12',  label: 'Campeão' },
  2: { ring: 'ring-white/25',       text: 'text-white/60',    bg: 'bg-white/8',        label: 'Vice' },
  3: { ring: 'ring-orange-400/35',  text: 'text-orange-400',  bg: 'bg-orange-400/12',  label: '3º lugar' },
}

function Face({ name, avatarUrl, size, ring }: { name: string | null; avatarUrl: string | null; size: number; ring: string }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name ?? ''}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover shrink-0 ring-2 ${ring}`}
      />
    )
  }
  return (
    <div
      className={`rounded-full grid place-items-center shrink-0 ring-2 ${ring} bg-white/8`}
      style={{ width: size, height: size }}
    >
      {name ? (
        <span className="font-bold text-white/70" style={{ fontSize: size * 0.4 }}>
          {name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <User className="text-white/30" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </div>
  )
}

/**
 * Destaque de quem venceu ao fim da competição.
 * - 1 colocado  → faixa de campeão (desafio 1v1/duplas).
 * - 2+ colocados → pódio ouro/prata/bronze (liga, eliminatória).
 */
export function Podium({ places, title = 'Pódio' }: { places: PodiumPlace[]; title?: string }) {
  const sorted = [...places].sort((a, b) => a.position - b.position)
  if (sorted.length === 0) return null

  const champ = sorted.find((p) => p.position === 1) ?? sorted[0]
  const rest = sorted.filter((p) => p !== champ)

  return (
    <div className="space-y-2.5">
      {/* Campeão em destaque */}
      <div className="glass glass-card glass-overlay flex items-center gap-3 px-4 py-3.5 ring-1 ring-yellow-400/25">
        <div className="relative">
          <Face name={champ.name} avatarUrl={champ.avatarUrl} size={48} ring={MEDAL[1].ring} />
          <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary">
            <Trophy className="h-3 w-3 text-yellow-400" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-yellow-400/80">
            {sorted.length > 1 ? `${title} · Campeão` : 'Campeão'}
          </p>
          <p className="mt-0.5 truncate text-base font-black text-white leading-snug">
            {champ.name ?? 'Vencedor'}
          </p>
        </div>
        <Trophy className="h-6 w-6 shrink-0 text-yellow-400/50" />
      </div>

      {/* 2º e 3º */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {rest.map((p) => {
            const m = MEDAL[p.position]
            return (
              <div key={p.position} className="glass glass-card flex items-center gap-2.5 px-3 py-2.5">
                <Face name={p.name} avatarUrl={p.avatarUrl} size={32} ring={m.ring} />
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest ${m.text}`}>
                    <Medal className="h-3 w-3" />
                    {m.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-bold text-white/85 leading-snug">
                    {p.name ?? '—'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
