'use client'

import { useState } from 'react'
import { Lock, Eye, EyeOff, Check } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

/**
 * Define/atualiza a senha da conta — permite que usuários de link mágico passem
 * a entrar por e-mail + senha (útil no app instalado, sem abrir o navegador).
 */
export function PasswordSection() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const valid = password.length >= 6 && password === confirm

  async function save() {
    if (!valid || status === 'saving') return
    setStatus('saving')
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Não foi possível salvar a senha. Tente novamente.')
      setStatus('error')
      return
    }
    setPassword('')
    setConfirm('')
    setStatus('done')
  }

  return (
    <div className="glass glass-card mt-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Lock className="h-4 w-4 text-secondary/80" />
        <h2 className="font-display text-sm font-bold text-white">Senha de acesso</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-white/50">
        Defina uma senha para entrar com e-mail e senha — sem precisar do link mágico
        (ideal no app instalado).
      </p>

      <div className="space-y-3">
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            placeholder="Nova senha"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (status !== 'idle') setStatus('idle') }}
            autoComplete="new-password"
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-4 pr-11 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/35 transition hover:text-white/70"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <input
          type={show ? 'text' : 'password'}
          placeholder="Confirmar senha"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); if (status !== 'idle') setStatus('idle') }}
          autoComplete="new-password"
          className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
        />

        {confirm.length > 0 && password !== confirm && (
          <p className="px-1 text-[11px] text-red-400">As senhas não coincidem.</p>
        )}
        {error && <p className="px-1 text-[11px] text-red-400">{error}</p>}
        {status === 'done' && (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-secondary">
            <Check className="h-3.5 w-3.5" /> Senha salva. Já pode entrar com e-mail e senha.
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={!valid || status === 'saving'}
          className="w-full rounded-2xl border border-white/12 bg-white/5 py-3 text-sm font-semibold text-white/80 transition active:scale-95 hover:bg-white/8 disabled:opacity-40"
        >
          {status === 'saving' ? 'Salvando…' : 'Salvar senha'}
        </button>
      </div>
    </div>
  )
}
