'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { PASSWORD_HINT, isPasswordLongEnough, translatePasswordError } from '@/lib/auth/password'
import { Logo } from '@/components/Logo'
import { Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle, Sparkles } from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot'
type Status = 'idle' | 'loading' | 'magic-loading' | 'reset-loading' | 'sent' | 'signup-confirm' | 'reset-sent' | 'error'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const emailOk = email.trim().length > 3 && email.includes('@')
  // Criar conta: mínimo novo. Entrar: só não vazia (contas antigas têm senha de 6+).
  const passwordOk = mode === 'signup' ? isPasswordLongEnough(password) : password.length > 0

  function fail(msg: string) {
    setErrorMsg(msg)
    setStatus('error')
  }

  // ── Entrar / criar conta com SENHA ──────────────────────────────────────────
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!emailOk || !passwordOk || status === 'loading') return
    setStatus('loading')
    setErrorMsg(null)
    const supabase = createClient()

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      })
      if (error) return fail(traduzErro(error.message))
      if (data.session) {
        router.push('/')
        router.refresh()
      } else {
        // Confirmação de e-mail está ativada no projeto.
        setStatus('signup-confirm')
      }
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return fail(traduzErro(error.message))
    router.push('/')
    router.refresh()
  }

  // ── Redefinir senha (e-mail de recuperação) ─────────────────────────────────
  async function handleResetPassword() {
    if (!emailOk || status === 'reset-loading') return
    setStatus('reset-loading')
    setErrorMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/auth/update-password`,
    })
    if (error) return fail(traduzErro(error.message))
    setStatus('reset-sent')
  }

  // ── Entrar com LINK MÁGICO (só e-mail) ──────────────────────────────────────
  async function handleMagicLink() {
    if (!emailOk || status === 'magic-loading') return
    setStatus('magic-loading')
    setErrorMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) return fail(traduzErro(error.message))
    setStatus('sent')
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

        {status === 'sent' ? (
          <ConfirmCard
            title="Verifique seu e-mail"
            body={<>Enviamos um link mágico para <span className="font-medium text-white/85">{email}</span>. Clique no link para entrar.</>}
            onReset={() => setStatus('idle')}
          />
        ) : status === 'signup-confirm' ? (
          <ConfirmCard
            title="Confirme seu e-mail"
            body={<>Enviamos um e-mail de confirmação para <span className="font-medium text-white/85">{email}</span>. Confirme para ativar sua conta e depois entre com e-mail e senha.</>}
            onReset={() => { setStatus('idle'); setMode('login') }}
          />
        ) : status === 'reset-sent' ? (
          <ConfirmCard
            title="Link enviado!"
            body={<>Enviamos um link para <span className="font-medium text-white/85">{email}</span>. Clique nele para criar ou redefinir sua senha.</>}
            onReset={() => { setStatus('idle'); setMode('login') }}
          />
        ) : (
          <div className="glass glass-card p-7">
            <h2 className="mb-1 font-display text-lg font-bold text-white">
              {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Redefinir senha'}
            </h2>
            <p className="mb-6 text-sm text-white/55">
              {mode === 'login'
                ? 'Use e-mail e senha, ou receba um link mágico.'
                : mode === 'signup'
                  ? 'Defina e-mail e senha para acessar pelo app.'
                  : 'Informe seu e-mail e enviaremos um link para você definir uma senha nova.'}
            </p>

            {/* ── MODO ESQUECI A SENHA ───────────────────────────────────────── */}
            {mode === 'forgot' ? (
              <>
                <div className="space-y-3.5">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle') }}
                      autoComplete="email"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
                    />
                  </div>

                  {status === 'error' && errorMsg && (
                    <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{errorMsg}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={status === 'reset-loading' || !emailOk}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
                    style={{ background: '#cdfd51' }}
                  >
                    {status === 'reset-loading' ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        Enviando…
                      </>
                    ) : (
                      <>
                        Enviar link de redefinição
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-5 text-center text-xs text-white/45">
                  Lembrou a senha?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setStatus('idle'); setErrorMsg(null) }}
                    className="font-semibold text-secondary underline-offset-2 hover:underline"
                  >
                    Voltar ao login
                  </button>
                </p>
              </>
            ) : (
              /* ── MODOS LOGIN / SIGNUP ──────────────────────────────────────── */
              <>
                <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                  {/* E-mail */}
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle') }}
                      required
                      autoComplete="email"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
                    />
                  </div>

                  {/* Senha */}
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      placeholder="Sua senha"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (status === 'error') setStatus('idle') }}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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

                  {mode === 'signup' ? (
                    <p className="px-1 text-[11px] text-white/35">{PASSWORD_HINT}</p>
                  ) : (
                    /* Link "Esqueci a senha" — só no login */
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setStatus('idle'); setErrorMsg(null) }}
                        className="text-[11px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                  )}

                  {status === 'error' && errorMsg && (
                    <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{errorMsg}</p>
                  )}

                  {/* Botão senha */}
                  <button
                    type="submit"
                    disabled={status === 'loading' || !emailOk || !passwordOk}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
                    style={{ background: '#cdfd51' }}
                  >
                    {status === 'loading' ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        {mode === 'login' ? 'Entrando…' : 'Criando…'}
                      </>
                    ) : (
                      <>
                        {mode === 'login' ? 'Entrar' : 'Criar conta'}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Divisor */}
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[11px] text-white/30">ou</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                {/* Magic link (só e-mail) */}
                <button
                  type="button"
                  onClick={handleMagicLink}
                  disabled={status === 'magic-loading' || !emailOk}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/5 py-3 text-sm font-semibold text-white/80 transition active:scale-95 hover:bg-white/8 disabled:opacity-40"
                >
                  {status === 'magic-loading' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Enviando…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-secondary" />
                      Entrar com link mágico
                    </>
                  )}
                </button>

                {/* Alternar login/signup */}
                <p className="mt-5 text-center text-xs text-white/45">
                  {mode === 'login' ? (
                    <>
                      Não tem conta?{' '}
                      <button
                        type="button"
                        onClick={() => { setMode('signup'); setStatus('idle'); setErrorMsg(null) }}
                        className="font-semibold text-secondary underline-offset-2 hover:underline"
                      >
                        Criar conta
                      </button>
                    </>
                  ) : (
                    <>
                      Já tem conta?{' '}
                      <button
                        type="button"
                        onClick={() => { setMode('login'); setStatus('idle'); setErrorMsg(null) }}
                        className="font-semibold text-secondary underline-offset-2 hover:underline"
                      >
                        Entrar
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function ConfirmCard({
  title,
  body,
  onReset,
}: {
  title: string
  body: React.ReactNode
  onReset: () => void
}) {
  return (
    <div className="glass glass-card flex flex-col items-center gap-4 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full" style={{ background: 'rgba(205,253,81,0.15)' }}>
        <CheckCircle className="h-7 w-7 text-secondary" />
      </div>
      <div>
        <p className="font-display text-lg font-bold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/60">{body}</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-2 text-xs text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
      >
        Voltar
      </button>
    </div>
  )
}

function traduzErro(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos. Se você costuma entrar por link mágico, defina uma senha no seu perfil.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (m.includes('user already registered')) return 'Este e-mail já tem conta. Use "Entrar".'
  const senha = translatePasswordError(msg)
  if (senha) return senha
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um instante.'
  return 'Algo deu errado. Tente novamente.'
}
