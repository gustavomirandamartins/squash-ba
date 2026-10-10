import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { TermsContent, TERMS_UPDATED_AT } from '@/components/TermsContent'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { AcceptForm } from './AcceptForm'

export const metadata: Metadata = { title: 'Termos de Uso — SquashBa' }

// Quem já tinha conta (ou entrou sem passar pelo cadastro com aceite) aceita
// aqui antes de usar o app. O layout do app manda para cá enquanto faltar.
export default async function AceitarTermosPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at')
    .eq('id', user.id)
    .single()
  if (profile?.terms_accepted_at) redirect('/')

  return (
    <div
      className="relative min-h-dvh px-6 pb-10 pt-[max(2.5rem,calc(var(--top-inset)+1rem))]"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)' }}
    >
      <div className="mx-auto w-full max-w-[640px] space-y-6">
        <Logo />
        <div className="glass glass-card space-y-6 p-7">
          <header>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
              Termos de Uso
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Para continuar usando o SquashBa, leia e aceite os termos. Última atualização:{' '}
              {TERMS_UPDATED_AT}.
            </p>
          </header>
          <TermsContent />
          <AcceptForm />
        </div>
      </div>
    </div>
  )
}
