import { Plus, Swords, Trophy } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

export const metadata = { title: 'Jogos' }

export default async function JogosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Participações confirmadas do usuário (desafios)
  const { data: desafiosRaw } = user
    ? await supabase
        .from('participant_members')
        .select(
          `participant_id,
           participants!inner(
             id, championship_id, enrollment_status,
             championships!inner(id, name, status, format)
           )`,
        )
        .eq('user_id', user.id)
        .in('participants.enrollment_status', ['confirmado', 'pendente'])
        .eq('participants.championships.format', 'desafio')
    : { data: null }

  // Campeonatos liga/etc com participação confirmada
  const { data: campsRaw } = user
    ? await supabase
        .from('participant_members')
        .select(
          `participant_id,
           participants!inner(
             id, championship_id, enrollment_status,
             championships!inner(id, name, status, format)
           )`,
        )
        .eq('user_id', user.id)
        .eq('participants.enrollment_status', 'confirmado')
        .neq('participants.championships.format', 'desafio')
        .in('participants.championships.status', ['ativo', 'rascunho'])
    : { data: null }

  // Normalização: deduplica por championship_id
  type ChampEntry = { id: string; name: string; status: string; format: string }
  const seen = new Set<string>()

  function toChampEntry(raw: typeof desafiosRaw): ChampEntry[] {
    const result: ChampEntry[] = []
    for (const row of raw ?? []) {
      const participant = (row as unknown as { participants: { championships: ChampEntry[] | ChampEntry } }).participants
      const champsValue = participant?.championships
      const champ = Array.isArray(champsValue) ? champsValue[0] : champsValue
      if (champ && !seen.has(champ.id)) {
        seen.add(champ.id)
        result.push(champ)
      }
    }
    return result
  }

  const desafios = toChampEntry(desafiosRaw)
  const campeonatos = toChampEntry(campsRaw)

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    rascunho:  { label: 'Aguardando',   cls: 'bg-yellow-500/15 text-yellow-400/70' },
    ativo:     { label: 'Em andamento', cls: 'bg-secondary/20 text-secondary' },
    encerrado: { label: 'Encerrado',    cls: 'bg-white/5 text-white/30' },
  }

  return (
    <div className="px-5 py-4 space-y-6">
      {/* Header + botão criar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">Jogos</h1>
          <p className="text-xs text-white/40 mt-0.5">Seus desafios e campeonatos</p>
        </div>
        <Link
          href="/desafios/novo"
          className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-xs font-bold text-primary transition active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          Criar desafio
        </Link>
      </div>

      {/* ── Meus desafios ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-3 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">
            Meus desafios
          </p>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {desafios.length === 0 ? (
          <div className="glass glass-card px-4 py-8 text-center space-y-2">
            <Swords className="h-7 w-7 text-white/15 mx-auto" />
            <p className="text-sm text-white/30">Nenhum desafio ainda.</p>
            <Link
              href="/desafios/novo"
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-4 py-2 text-xs font-semibold text-secondary transition active:scale-95"
            >
              <Plus className="h-3 w-3" />
              Criar desafio 1v1
            </Link>
          </div>
        ) : (
          desafios.map((d) => {
            const st = STATUS_LABEL[d.status] ?? STATUS_LABEL.rascunho
            return (
              <Link
                key={d.id}
                href={`/desafios/${d.id}`}
                className="glass glass-card px-4 py-3.5 flex items-center gap-3 active:scale-[0.985] transition-transform"
              >
                <div className="h-9 w-9 rounded-xl bg-secondary/12 grid place-items-center shrink-0">
                  <Swords className="h-4 w-4 text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{d.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">Desafio 1v1</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${st.cls}`}>
                  {st.label}
                </span>
              </Link>
            )
          })
        )}
      </section>

      {/* ── Meus campeonatos ── */}
      {campeonatos.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">
              Meus campeonatos
            </p>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {campeonatos.map((c) => {
            const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.ativo
            return (
              <Link
                key={c.id}
                href={`/campeonatos/${c.id}`}
                className="glass glass-card px-4 py-3.5 flex items-center gap-3 active:scale-[0.985] transition-transform"
              >
                <div className="h-9 w-9 rounded-xl bg-secondary/10 grid place-items-center shrink-0">
                  <Trophy className="h-4 w-4 text-secondary/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                  <p className="text-xs text-white/40 mt-0.5 capitalize">{c.format === 'liga' ? 'Liga' : c.format}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${st.cls}`}>
                  {st.label}
                </span>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
