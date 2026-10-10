import type { Metadata } from 'next'
import { BackLink } from '@/components/BackLink'
import { Logo } from '@/components/Logo'
import { TermsContent, TERMS_UPDATED_AT } from '@/components/TermsContent'

export const metadata: Metadata = {
  title: 'Termos de Uso — SquashBa',
  description: 'Regras de uso do SquashBa: conteúdo permitido, denúncias, bloqueio e exclusão de conta.',
}

export default function TermosPage() {
  return (
    <div
      className="relative min-h-dvh px-6 pb-10 pt-[max(2.5rem,calc(var(--top-inset)+1rem))]"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)' }}
    >
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <BackLink />
        </div>

        <div className="glass glass-card space-y-6 p-7">
          <header>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
              Termos de Uso — SquashBa
            </h1>
            <p className="mt-1 text-sm text-white/45">Última atualização: {TERMS_UPDATED_AT}</p>
          </header>
          <TermsContent />
        </div>
      </div>
    </div>
  )
}
