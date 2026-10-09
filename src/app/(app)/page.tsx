import { Suspense } from 'react'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { HomeReveal } from '@/components/home/HomeReveal'
import { WelcomeHeader } from '@/components/home/WelcomeHeader'
import { PwaInstallBanner } from '@/components/home/PwaInstallBanner'
import { SectionSkeleton } from '@/components/PageSkeleton'
import {
  FeedSection, LembretesSection, OngoingDataSection, RankingSection, SponsorSection,
} from '@/components/home/HomeSections'

// Home em streaming: o topo (saudação) aparece na hora; cada seção busca os
// próprios dados e chega quando fica pronta — uma seção lenta não segura as
// outras. Antes: 4 rodadas de consultas em sequência antes de mostrar algo.
export default async function HomePage() {
  const supabase = await createClient()
  const user = await getAuthUser()

  // Layout (app)/layout.tsx já garante autenticação; salvaguarda de tipo.
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, gender, birth_date, avatar_url')
    .eq('id', user.id)
    .single()

  const firstName = (profile?.full_name ?? 'Jogador').trim().split(/\s+/)[0]
  // Aniversário hoje? (dia e mês em UTC)
  const isBirthday = (() => {
    if (!profile?.birth_date) return false
    const today = new Date()
    const birth = new Date(profile.birth_date)
    return today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() === birth.getUTCDate()
  })()

  // Cascata de entrada só na primeira abertura (HomeReveal).
  return (
    <HomeReveal>
      {[
        <WelcomeHeader key="welcome" firstName={firstName} gender={profile?.gender ?? null} />,
        <PwaInstallBanner key="pwa-install" />,
        <Suspense key="lembretes" fallback={<SectionSkeleton rows={1} />}>
          <LembretesSection userId={user.id} isBirthday={isBirthday} />
        </Suspense>,
        <Suspense key="sponsor" fallback={null}>
          <SponsorSection />
        </Suspense>,
        <Suspense key="ongoing" fallback={<SectionSkeleton rows={2} />}>
          <OngoingDataSection />
        </Suspense>,
        <Suspense key="ranking" fallback={<SectionSkeleton rows={3} />}>
          <RankingSection />
        </Suspense>,
        <Suspense key="community" fallback={<SectionSkeleton rows={2} />}>
          <FeedSection
            userId={user.id}
            userName={profile?.full_name ?? null}
            userAvatar={profile?.avatar_url ?? null}
          />
        </Suspense>,
      ]}
    </HomeReveal>
  )
}
