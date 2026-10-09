import { createClient, getAuthUser } from '@/utils/supabase/server'
import { CampeonatosListClient } from '@/components/campeonatos/CampeonatosListClient'
import { PendingList } from '@/components/offline/PendingList'
import {
  CampeonatosHeader, ChampionshipsLabel, MyChallengesSection, NoChampionships,
} from '@/components/campeonatos/CampeonatosPageParts'

export const metadata = { title: 'Campeonatos' }

type ChampEntry = { id: string; name: string; status: string; format: string }

export default async function CampeonatosPage() {
  const supabase = await createClient()
  const user = await getAuthUser()

  // Todos os campeonatos públicos (exceto desafios)
  const { data: championships } = await supabase
    .from('championships')
    .select('id, name, format, status, is_official, created_at')
    .neq('format', 'desafio')
    .order('created_at', { ascending: false })

  // Desafios do usuário logado
  const desafios: ChampEntry[] = []
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
      <CampeonatosHeader />

      {/* Pendentes offline */}
      <PendingList kind="campeonato" />
      <PendingList kind="desafio" />

      <MyChallengesSection desafios={desafios} />

      <section className="space-y-2">
        <ChampionshipsLabel show={desafios.length > 0} />
        {list.length === 0 ? <NoChampionships /> : <CampeonatosListClient championships={list} />}
      </section>
    </div>
  )
}
