import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/Logo'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description:
    'Como o SquashBa coleta, usa e protege seus dados pessoais, em conformidade com a LGPD.',
}

export default function PrivacidadePage() {
  return (
    <div
      className="relative min-h-dvh px-6 py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <Link
            href="/onboarding"
            className="flex items-center gap-1.5 text-sm text-white/55 transition hover:text-white/85"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>

        <div className="glass glass-card space-y-6 p-7">
          <header>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
              Política de Privacidade
            </h1>
            <p className="mt-1 text-sm text-white/45">
              Última atualização: 26 de maio de 2026
            </p>
          </header>

          <section className="space-y-2">
            <h2 className="font-display text-base font-bold text-secondary">
              1. Quais dados coletamos
            </h2>
            <p className="text-sm leading-relaxed text-white/70">
              Coletamos os dados que você fornece ao criar sua conta e completar
              seu perfil: nome, e-mail, data de nascimento, gênero, telefone e
              foto. Esses dados são usados para identificar você na comunidade e
              viabilizar a participação em jogos e campeonatos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-base font-bold text-secondary">
              2. Como usamos seus dados
            </h2>
            <p className="text-sm leading-relaxed text-white/70">
              Seus dados são usados exclusivamente para o funcionamento do
              SquashBa: exibir seu perfil, organizar partidas, gerar
              classificações e permitir contato entre membros. Não vendemos nem
              compartilhamos seus dados com terceiros para fins de marketing.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-base font-bold text-secondary">
              3. Visibilidade do perfil
            </h2>
            <p className="text-sm leading-relaxed text-white/70">
              Nome e foto são públicos dentro da comunidade. E-mail e telefone
              são privados e visíveis apenas para você e para a administração da
              plataforma.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-base font-bold text-secondary">
              4. Seus direitos (LGPD)
            </h2>
            <p className="text-sm leading-relaxed text-white/70">
              Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018),
              você pode solicitar a qualquer momento o acesso, correção,
              portabilidade ou exclusão dos seus dados, bem como revogar o
              consentimento. Para exercer esses direitos, entre em contato pelo
              e-mail abaixo.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-base font-bold text-secondary">
              5. Contato do encarregado
            </h2>
            <p className="text-sm leading-relaxed text-white/70">
              Dúvidas sobre privacidade e tratamento de dados:{' '}
              <a
                href="mailto:contato@gustavomartins.com"
                className="font-medium text-secondary underline-offset-2 hover:underline"
              >
                contato@gustavomartins.com
              </a>
            </p>
          </section>

          <p className="border-t border-white/10 pt-4 text-xs leading-relaxed text-white/40">
            Este é um documento preliminar e pode ser revisado. Recomenda-se
            validação jurídica antes do lançamento em produção.
          </p>
        </div>
      </div>
    </div>
  )
}
