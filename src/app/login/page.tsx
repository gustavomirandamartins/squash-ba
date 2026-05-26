'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Logo } from '@/components/Logo'
import { Mail, ArrowRight, CheckCircle } from 'lucide-react'

type State = 'idle' | 'loading' | 'sent' | 'error'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || state === 'loading') return

    setState('loading')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setState('error')
    } else {
      setState('sent')
    }
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center px-6"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      {/* Fundo decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: '#cdfd51' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <Logo size={56} showWordmark={false} />
          <div className="text-center">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
              Squash<span className="text-secondary">Ba</span>
            </h1>
            <p className="mt-1 text-sm text-white/55">
              A comunidade do Squash baiano
            </p>
          </div>
        </div>

        {state === 'sent' ? (
          /* Estado: link enviado */
          <div className="glass glass-card flex flex-col items-center gap-4 p-8 text-center">
            <div
              className="grid h-14 w-14 place-items-center rounded-full"
              style={{ background: 'rgba(205,253,81,0.15)' }}
            >
              <CheckCircle className="h-7 w-7 text-secondary" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-white">
                Verifique seu e-mail
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/60">
                Enviamos um link mágico para{' '}
                <span className="font-medium text-white/85">{email}</span>.
                <br />
                Clique no link para entrar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setState('idle')}
              className="mt-2 text-xs text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
            >
              Usar outro e-mail
            </button>
          </div>
        ) : (
          /* Estado: formulário */
          <div className="glass glass-card p-7">
            <h2 className="mb-1 font-display text-lg font-bold text-white">
              Entrar
            </h2>
            <p className="mb-6 text-sm text-white/55">
              Receba um link mágico no seu e-mail — sem senha.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (state === 'error') setState('idle')
                  }}
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none ring-0 transition focus:border-secondary/50 focus:bg-white/8"
                />
              </div>

              {state === 'error' && (
                <p className="text-xs text-red-400">
                  Algo deu errado. Tente novamente em instantes.
                </p>
              )}

              <button
                type="submit"
                disabled={state === 'loading' || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
                style={{
                  background:
                    state === 'loading' || !email.trim()
                      ? '#cdfd5199'
                      : '#cdfd51',
                }}
              >
                {state === 'loading' ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    Enviando…
                  </>
                ) : (
                  <>
                    Entrar com link mágico
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
