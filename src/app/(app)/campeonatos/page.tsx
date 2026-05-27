import Link from 'next/link'
import { Plus, Trophy, ChevronRight } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'

export const metadata = { title: 'Campeonatos' }

const FORMAT_LABEL: Record<string, string> = {
  liga: 'Liga',
  grupos_elim: 'Grupos + Eliminatórias',
  eliminatoria: 'Eliminatórias',
  desafio: 'Desafio',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  rascunho: { label: 'Rascunho', className: 'bg-white/8 text-white/45' },
  ativo: { label: 'Ativo', className: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado', className: 'bg-white/5 text-white/30' },
}

export default async function CampeonatosPage() {
  const supabase = await createClient()

  const { data: championships } = await supabase
    .from('championships')
    .select('id, name, format, status, created_at')
    .order('created_at', { ascending: false })

  const list = championships ?? []

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Campeonatos</h1>
        <Link
          href="/campeonatos/novo"
          className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-primary transition active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Criar
        </Link>
      </div>

      {/* List or empty state */}
      {list.length === 0 ? (
        <div className="glass glass-card flex flex-col items-center gap-3 py-14 text-center">
          <Trophy className="h-10 w-10 text-secondary/30" />
          <p className="text-sm text-white/40">Nenhum campeonato ainda.</p>
          <Link
            href="/campeonatos/novo"
            className="rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-primary transition active:scale-95"
          >
            Criar primeiro campeonato
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((c) => {
            const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.rascunho
            return (
              <Link
                key={c.id}
                href={`/campeonatos/${c.id}`}
                className="glass glass-card flex items-center gap-3 px-4 py-3 transition active:scale-[0.98]"
              >
                <Trophy className="h-5 w-5 shrink-0 text-secondary/50" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white/90">
                    {c.name}
                  </p>
                  <p className="text-xs text-white/40">
                    {FORMAT_LABEL[c.format] ?? c.format}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
