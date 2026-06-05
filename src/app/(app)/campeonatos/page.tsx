import Link from 'next/link'
import { Plus, Trophy, Swords } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { CampeonatosListClient } from '@/components/campeonatos/CampeonatosListClient'
import { PendingList } from '@/components/offline/PendingList'
import { RouteWarmer } from '@/components/offline/RouteWarmer'

export const metadata = { title: 'Campeonatos' }

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: 'Aguardando',   cls: 'bg-yellow-500/15 text-yellow-400/70' },
  ativo:     { label: 'Em andamento', cls: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado',    cls: 'bg-white/5 text-white/30' },
}

type ChampEntry = { id: string; name: string; status: string; format: string }

export default async function CampeonatosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Todos os campeonatos públicos (exceto desafios)
  const { data: championships } = await supabase
    .from('championships')
    .select('id, name, format, status, is_official, created_at')
    .neq('format', 'desafio')
    .order('created_at', { ascending: false })

  // Desafios do usuário logado
  let desafios: ChampEntry[] = []
  if (user) {
    const { data: desafiosRaw } = await supabase
      .from('participant_members')
      .select(
        `participants!inner(
           championship_id, enrollment_status,
           championships!inner(id, name, status, format)
         )`,
      )
      .eq('user_id', user.id)
      .in('participants.enrollment_status', ['confirmado', 'pendente'])
      .eq('participants.championships.format', 'desafio')

    const seen = new Set<string>()
    for (const row of desafiosRaw ?? []) {
      const champ = (row as unknown as { participants: { championships: ChampEntry | ChampEntry[] } })
        .participants?.championships
      const c = Array.isArray(champ) ? champ[0] : champ
      if (c && !seen.has(c.id)) { seen.add(c.id); desafios.push(c) }
    }
  }

  const list = championships ?? []

  return (
    <div className="px-5 py-4 space-y-6">
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

      {/* Pendentes offline */}
      <PendingList kind="campeonato" />
      <PendingList kind="desafio" />

      {/* ── Meus desafios ─────────────────────────────────────────────── */}
      {desafios.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">
              Meus desafios
            </p>
            <div className="flex-1 h-px bg-white/8" />
          </div>
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
      )}

      {/* ── Campeonatos ───────────────────────────────────────────────── */}
      <section className="space-y-2">
        {desafios.length > 0 && (
          <div className="flex items-center gap-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">
              Campeonatos
            </p>
            <div className="flex-1 h-px bg-white/8" />
          </div>
        )}

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
      </section>

      <RouteWarmer
        paths={[
          ...desafios.map((d) => `/desafios/${d.id}`),
          ...list.map((c) => `/campeonatos/${c.id}`),
        ]}
      />
    </div>
  )
}
