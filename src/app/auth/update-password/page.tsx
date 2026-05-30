import { createClient } from '@/utils/supabase/server'
import { Logo } from '@/components/Logo'
import Link from 'next/link'
import { Lock, ArrowRight } from 'lucide-react'
import { UpdatePasswordClient } from './UpdatePasswordClient'

/**
 * Página de definição de nova senha — Server Component.
 *
 * O check de sessão é feito no servidor (getUser), que lê os cookies
 * diretamente dos headers HTTP — evita problemas de sincronização com o
 * browser client quando a sessão é do tipo "recovery".
 *
 * O formulário de atualização é um Client Component separado que chama
 * um Server Action (updatePasswordAction), mantendo o mesmo acesso pleno
 * à sessão via cookies do servidor.
 */
export default async function UpdatePasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-10"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: '#cdfd51' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={56} showWordmark={false} />
          <div className="text-center">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
              Squash<span className="text-secondary">Ba</span>
            </h1>
            <p className="mt-1 text-sm text-white/55">A comunidade do Squash baiano</p>
          </div>
        </div>

        {user ? (
          /* Sessão válida — mostra o formulário (Client Component) */
          <UpdatePasswordClient />
        ) : (
          /* Sem sessão: link expirado ou inválido */
          <div className="glass glass-card flex flex-col items-center gap-4 p-8 text-center">
            <div
              className="grid h-14 w-14 place-items-center rounded-full"
              style={{ background: 'rgba(205,253,81,0.15)' }}
            >
              <Lock className="h-7 w-7 text-secondary" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-white">
                Link inválido ou expirado
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/60">
                Solicite um novo link de redefinição de senha pela tela de login.
              </p>
            </div>
            <Link
              href="/login"
              className="mt-2 flex items-center gap-1.5 rounded-2xl px-5 py-2.5 font-display text-sm font-bold text-primary transition active:scale-95"
              style={{ background: '#cdfd51' }}
            >
              Ir para o login
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
