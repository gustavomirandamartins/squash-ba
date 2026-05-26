'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Camera, User, Calendar, Phone, ChevronDown, Mail } from 'lucide-react'
import { Logo } from '@/components/Logo'

type Gender = 'masculino' | 'feminino' | 'outro' | 'nao_informado'

interface Props {
  userId: string
  email: string
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
  { value: 'nao_informado', label: 'Prefiro não informar' },
]

// Máscara progressiva: (XX) XXXXX-XXXX — até 11 dígitos.
function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// Estilo de label reutilizado em todos os campos.
const LABEL_CLS =
  'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/35'

export function OnboardingForm({ userId, email }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState<Gender>('nao_informado')
  const [phone, setPhone] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = fullName.trim().length > 0 && consent && !saving

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !consent || saving) return

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      let avatarUrl: string | null = null

      // 1. Upload do avatar (se selecionado)
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() ?? 'jpg'
        const path = `${userId}/avatar.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })

        if (uploadError) throw new Error('Erro ao fazer upload da foto.')

        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }

      // 2. Atualiza public.profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          birth_date: birthDate || null,
          gender,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          onboarding_completed: true,
        })
        .eq('id', userId)

      if (profileError) throw new Error('Erro ao salvar perfil.')

      // 3. Atualiza public.profiles_private (telefone)
      if (phone.trim()) {
        const { error: privateError } = await supabase
          .from('profiles_private')
          .update({ phone: phone.trim() })
          .eq('user_id', userId)

        if (privateError) throw new Error('Erro ao salvar telefone.')
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tente novamente.')
      setSaving(false)
    }
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-start overflow-y-auto px-6 py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      {/* Fundo decorativo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-15 blur-3xl"
          style={{ background: '#cdfd51' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <Logo size={44} showWordmark={false} />
          <div className="text-center">
            <h1 className="font-display text-xl font-extrabold tracking-tight text-white">
              Complete seu perfil
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Só precisa fazer isso uma vez
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/15 transition active:scale-95"
              aria-label="Alterar foto"
            >
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="Prévia do avatar"
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white/5">
                  <User className="h-8 w-8 text-white/30" />
                </div>
              )}
              <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 to-transparent pb-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-4 w-4 text-white" />
              </div>
            </button>
            <span className="text-xs text-white/40">
              Toque para adicionar foto
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Email (readonly) */}
          <div>
            <span className={LABEL_CLS}>E-mail</span>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type="email"
                value={email}
                readOnly
                aria-readonly
                tabIndex={-1}
                className="w-full cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white/55 outline-none"
              />
            </div>
          </div>

          {/* Nome */}
          <div>
            <label htmlFor="ob-nome" className={LABEL_CLS}>
              Nome <span className="text-red-400/70">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                id="ob-nome"
                type="text"
                placeholder="Seu nome completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
              />
            </div>
          </div>

          {/* Data de nascimento */}
          <div>
            <label htmlFor="ob-nascimento" className={LABEL_CLS}>
              Data de nascimento
            </label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                id="ob-nascimento"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white/80 outline-none transition focus:border-secondary/50 focus:bg-white/8 [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Gênero */}
          <div>
            <label htmlFor="ob-genero" className={LABEL_CLS}>
              Gênero
            </label>
            <div className="relative">
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <select
                id="ob-genero"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-4 pr-11 text-sm text-white/80 outline-none transition focus:border-secondary/50 focus:bg-white/8"
                style={{ colorScheme: 'dark' }}
              >
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#1d2b45]">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Telefone */}
          <div>
            <label htmlFor="ob-telefone" className={LABEL_CLS}>
              Telefone
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                id="ob-telefone"
                type="tel"
                inputMode="numeric"
                placeholder="(71) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                autoComplete="tel"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8"
              />
            </div>
          </div>

          {/* Consentimento LGPD */}
          <label
            htmlFor="ob-consent"
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5"
          >
            <input
              id="ob-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-secondary"
            />
            <span className="text-xs leading-relaxed text-white/60">
              Li e concordo com a{' '}
              <Link
                href="/privacidade"
                target="_blank"
                className="font-medium text-secondary underline-offset-2 hover:underline"
              >
                Política de Privacidade
              </Link>{' '}
              e autorizo o tratamento dos meus dados pessoais conforme a LGPD.
            </span>
          </label>

          {error && (
            <p className="rounded-xl bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
            style={{ background: canSubmit ? '#cdfd51' : '#cdfd5199' }}
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                Salvando…
              </>
            ) : (
              'Pronto, vamos jogar!'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
