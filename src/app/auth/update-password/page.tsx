'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Logo } from '@/components/Logo'
import { Lock, Eye, EyeOff, Check, ArrowRight } from 'lucide-react'

/**
 * Página de definição de nova senha.
 * Acessada após o usuário clicar no link de redefinição enviado por e-mail.
 * O /auth/callback já verificou o token e estabeleceu a sessão de "recovery"
 * antes de redirecionar aqui.
 */
export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error' | 'no-session'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Verifica se há sessão ativa (vinda do link de recovery)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setStatus('no-session')
    })
  }, [])

  const valid = password.length >= 6 && password === confirm

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || status === 'saving') return
    setStatus('saving')
    setErrorMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorMsg('Não foi possível salvar a senha. O link pode ter expirado — solicite um novo.')
      setStatus('error')
      return
    }
    setStatus('done')
    // Aguarda 2s mostrando confirmação e redireciona
    setTimeout(() => router.push('/'), 2000)
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-10"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)' }}
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

        {/* Sem sessão (link expirado ou acessado direto) */}
        {status === 'no-session' ? (
          <div className="glass glass-card flex flex-col items-center gap-4 p-8 text-center">
            <div
              className="grid h-14 w-14 place-items-center rounded-full"
              style={{ background: 'rgba(205,253,81,0.15)' }}
            >
              <Lock className="h-7 w-7 text-secondary" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-white">Link inválido ou expirado</p>
              <p className="mt-1 text-sm leading-relaxed text-white/60">
                Solicite um novo link de redefinição de senha pela tela de login.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="mt-2 flex items-center gap-1.5 rounded-2xl px-5 py-2.5 font-display text-sm font-bold text-primary transition active:scale-95"
              style={{ background: '#cdfd51' }}
            >
              Ir para o login
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : status === 'done' ? (
          /* Sucesso */
          <div className="glass glass-card flex flex-col items-center gap-4 p-8 text-center">
            <div
              className="grid h-14 w-14 place-items-center rounded-full"
              style={{ background: 'rgba(205,253,81,0.15)' }}
            >
              <Check className="h-7 w-7 text-secondary" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-white">Senha definida!</p>
              <p className="mt-1 text-sm leading-relaxed text-white/60">
                Agora você pode entrar com e-mail e senha. Redirecionando…
              </p>
            </div>
          </div>
        ) : (
          /* Formulário */
          <div className="glass glass-card p-7">
            <h2 className="mb-1 font-display text-lg font-bold text-white">Nova senha</h2>
            <p className="mb-6 text-sm text-white/55">
              Escolha uma senha nova para entrar pelo app sem precisar do link mágico.
            </p>

            <form onSubmit={handleSave} className="space-y-3.5">
              {/* Nova senha */}
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Nova senha"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (status === 'error') setStatus('idle') }}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-11 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/35 transition hover:text-white/70"
                  aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Confirmar senha */}
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Confirmar nova senha"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); if (status === 'error') setStatus('idle') }}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
                />
              </div>

              {confirm.length > 0 && password !== confirm && (
                <p className="px-1 text-[11px] text-red-400">As senhas não coincidem.</p>
              )}
              <p className="px-1 text-[11px] text-white/35">Mínimo de 6 caracteres.</p>

              {status === 'error' && errorMsg && (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={!valid || status === 'saving'}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
                style={{ background: '#cdfd51' }}
              >
                {status === 'saving' ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    Salvando…
                  </>
                ) : (
                  <>
                    Salvar senha
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
