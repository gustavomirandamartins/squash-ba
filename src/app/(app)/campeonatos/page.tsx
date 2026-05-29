import Link from 'next/link'
import { Plus, Trophy } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { CampeonatosListClient } from '@/components/campeonatos/CampeonatosListClient'

export const metadata = { title: 'Campeonatos' }

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

      {/* Empty state (no championships at all) */}
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
        <CampeonatosListClient championships={list} />
      )}
    </div>
  )
}
