'use client'

/**
 * SearchDropdown — busca global ao vivo (pessoas, campeonatos, desafios, jogos).
 * O TopBar controla o estado `open` (para a animação do grid); aqui ficam o input,
 * o debounce, as consultas e o painel de resultados (posicionado abaixo do header).
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Search,
  X,
  User,
  Trophy,
  Swords,
  CalendarDays,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

type Person = { id: string; full_name: string | null; avatar_url: string | null }
type Champ = { id: string; name: string }
type Game = { id: string; display_name: string | null; href: string }

type Results = {
  people: Person[]
  championships: Champ[]
  challenges: Champ[]
  games: Game[]
}

const EMPTY: Results = { people: [], championships: [], challenges: [], games: [] }

interface Props {
  open: boolean
  onOpen: () => void
  onClose: () => void
}

export function SearchDropdown({ open, onOpen, onClose }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Foca o input após iniciar a animação de expansão
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open])

  function close() {
    setQuery('')
    setResults(EMPTY)
    onClose()
  }

  // Busca com debounce
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      const like = `%${q}%`
      const [people, champs, games] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .ilike('full_name', like)
          .limit(5),
        supabase
          .from('championships')
          .select('id, name, format')
          .ilike('name', like)
          .limit(8),
        supabase
          .from('participants')
          .select('id, display_name, championship_id, championships(format)')
          .ilike('display_name', like)
          .limit(5),
      ])

      const champRows = (champs.data ?? []) as Array<{ id: string; name: string; format: string }>
      const gameRows = (games.data ?? []) as unknown as Array<{
        id: string
        display_name: string | null
        championship_id: string
        championships: { format: string } | { format: string }[] | null
      }>

      setResults({
        people: (people.data ?? []) as Person[],
        championships: champRows.filter((c) => c.format !== 'desafio').slice(0, 5),
        challenges: champRows.filter((c) => c.format === 'desafio').slice(0, 5),
        games: gameRows.map((g) => {
          const champ = Array.isArray(g.championships) ? g.championships[0] : g.championships
          const isChallenge = champ?.format === 'desafio'
          return {
            id: g.id,
            display_name: g.display_name,
            href: isChallenge
              ? `/desafios/${g.championship_id}`
              : `/campeonatos/${g.championship_id}`,
          }
        }),
      })
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, supabase])

  const go = useCallback(
    (href: string) => {
      close()
      router.push(href)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  )

  // Pessoa → abre a ficha técnica do jogador
  function openPerson(userId: string) {
    go(`/jogador/${userId}`)
  }

  const hasQuery = query.trim().length >= 2
  const total =
    results.people.length +
    results.championships.length +
    results.challenges.length +
    results.games.length

  return (
    <>
      {/* Col 3 — botão / input (mesma animação do TopBar) */}
      <div className="relative h-10 overflow-hidden">
        {/* Botão redondo (fechado) */}
        <button
          type="button"
          aria-label="Buscar"
          onClick={onOpen}
          className="absolute inset-0 grid place-items-center rounded-full glass text-white/85 transition-all duration-200 active:scale-95"
          style={{
            opacity: open ? 0 : 1,
            pointerEvents: open ? 'none' : 'auto',
            transform: open ? 'scale(0.8)' : 'scale(1)',
          }}
        >
          <Search className="h-[18px] w-[18px]" />
        </button>

        {/* Barra expandida */}
        <div
          className="glass absolute inset-0 flex items-center gap-2 rounded-full px-3 transition-all duration-200"
          style={{
            opacity: open ? 1 : 0,
            pointerEvents: open ? 'auto' : 'none',
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-white/45" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            placeholder="Pessoas, campeonatos, jogos…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
          />
          <button type="button" aria-label="Fechar busca" onClick={close} className="shrink-0 transition active:scale-95">
            <X className="h-4 w-4 text-white/45" />
          </button>
        </div>
      </div>

      {/* Painel de resultados — posicionado relativo ao <header> (sticky) */}
      {open && hasQuery && (
        <div className="absolute inset-x-0 top-full z-40 px-4 pt-1">
          <div className="glass glass-card max-h-[70dvh] overflow-y-auto p-2">
            {loading && total === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-white/40">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </div>
            )}

            {!loading && total === 0 && (
              <p className="py-6 text-center text-xs text-white/40">Nada encontrado para “{query.trim()}”.</p>
            )}

            {results.people.length > 0 && (
              <Group title="Pessoas">
                {results.people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openPerson(p.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
                  >
                    {p.avatar_url ? (
                      <Image src={p.avatar_url} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary/15">
                        <User className="h-4 w-4 text-secondary" />
                      </span>
                    )}
                    <span className="truncate text-sm text-white/85">
                      {p.full_name ?? 'Jogador'}
                    </span>
                  </button>
                ))}
              </Group>
            )}

            {results.championships.length > 0 && (
              <Group title="Campeonatos">
                {results.championships.map((c) => (
                  <Row key={c.id} icon={<Trophy className="h-4 w-4 text-secondary/80" />} label={c.name} onClick={() => go(`/campeonatos/${c.id}`)} />
                ))}
              </Group>
            )}

            {results.challenges.length > 0 && (
              <Group title="Desafios">
                {results.challenges.map((c) => (
                  <Row key={c.id} icon={<Swords className="h-4 w-4 text-secondary/80" />} label={c.name} onClick={() => go(`/desafios/${c.id}`)} />
                ))}
              </Group>
            )}

            {results.games.length > 0 && (
              <Group title="Jogos">
                {results.games.map((g) => (
                  <Row key={g.id} icon={<CalendarDays className="h-4 w-4 text-secondary/80" />} label={g.display_name ?? 'Participante'} onClick={() => go(g.href)} />
                ))}
              </Group>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.06]">{icon}</span>
      <span className="truncate text-sm text-white/85">{label}</span>
    </button>
  )
}
