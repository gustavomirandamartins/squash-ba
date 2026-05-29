'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { compressImage } from '@/lib/compress-image'
import {
  Camera,
  User,
  Calendar,
  Phone,
  ChevronDown,
  Mail,
  ArrowLeft,
  Check,
  AlertTriangle,
  Tag,
  Users,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { subscribePush } from '@/lib/push'

type Gender = 'masculino' | 'feminino' | 'outro' | 'nao_informado'

interface Category {
  id: string
  name: string
}

interface Team {
  id: string
  name: string
}

interface Props {
  userId: string
  email: string
  categories: Category[]
  teams: Team[]
  initial: {
    fullName: string
    birthDate: string
    gender: Gender
    phone: string
    avatarUrl: string | null
    categoryId: string | null
    teamId: string | null
  }
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
  { value: 'nao_informado', label: 'Prefiro não informar' },
]

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const LABEL_CLS =
  'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/35'
const INPUT_CLS =
  'w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-secondary/50 focus:bg-white/8'

export function EditProfileForm({ userId, email, categories, teams, initial }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(initial.fullName)
  const [birthDate, setBirthDate] = useState(initial.birthDate)
  const [gender, setGender] = useState<Gender>(initial.gender)
  const [phone, setPhone] = useState(formatPhone(initial.phone))
  const [categoryId, setCategoryId] = useState<string>(initial.categoryId ?? '')
  const [teamId, setTeamId] = useState<string>(initial.teamId ?? '')

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initial.avatarUrl
  )

  const [compressing, setCompressing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    setError(null)
    try {
      const compressed = await compressImage(file)
      setAvatarFile(compressed)
      setAvatarPreview(URL.createObjectURL(compressed))
    } catch {
      setError('Não foi possível processar a imagem. Tente outra.')
    } finally {
      setCompressing(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || saving) return

    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const supabase = createClient()
      let avatarUrl = initial.avatarUrl

      if (avatarFile) {
        const path = `${userId}/avatar.jpg`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: 'image/jpeg' })
        if (uploadError) throw new Error('Erro ao enviar a foto.')
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(path)
        // cache-busting para refletir a troca imediatamente
        avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          birth_date: birthDate || null,
          gender,
          category_id: categoryId || null,
          team_id: teamId || null,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        })
        .eq('id', userId)
      if (profileError) throw new Error('Erro ao salvar perfil.')

      const { error: privateError } = await supabase
        .from('profiles_private')
        .update({ phone: phone.trim() || null })
        .eq('user_id', userId)
      if (privateError) throw new Error('Erro ao salvar telefone.')

      setSaved(true)
      router.refresh()
      // Ativa Web Push best-effort (não bloqueia se o usuário recusar)
      void subscribePush()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) throw new Error('Não foi possível excluir a conta.')
      router.push('/login')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tente novamente.')
      setDeleting(false)
    }
  }

  return (
    <div
      className="relative min-h-dvh px-6 py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-[480px]">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-white/55 transition hover:text-white/85"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>

        <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-white">
          Editar perfil
        </h1>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={compressing}
              className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/15 transition active:scale-95 disabled:opacity-70"
              aria-label="Alterar foto"
            >
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="Avatar"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/5">
                  <User className="h-8 w-8 text-white/30" />
                </div>
              )}
              {compressing ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 to-transparent pb-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-4 w-4 text-white" />
                </div>
              )}
            </button>
            <span className="text-xs text-white/40">
              {compressing ? 'Otimizando imagem…' : 'Toque para trocar a foto'}
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
            <label htmlFor="ep-nome" className={LABEL_CLS}>
              Nome <span className="text-red-400/70">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                id="ep-nome"
                type="text"
                placeholder="Seu nome completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Data de nascimento */}
          <div>
            <label htmlFor="ep-nascimento" className={LABEL_CLS}>
              Data de nascimento
            </label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                id="ep-nascimento"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className={`${INPUT_CLS} text-white/80 [color-scheme:dark]`}
              />
            </div>
          </div>

          {/* Gênero */}
          <div>
            <label htmlFor="ep-genero" className={LABEL_CLS}>
              Gênero
            </label>
            <div className="relative">
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <select
                id="ep-genero"
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
            <label htmlFor="ep-telefone" className={LABEL_CLS}>
              Telefone
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                id="ep-telefone"
                type="tel"
                inputMode="numeric"
                placeholder="(71) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                autoComplete="tel"
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Categoria */}
          {categories.length > 0 && (
            <div>
              <label htmlFor="ep-categoria" className={LABEL_CLS}>
                Categoria
              </label>
              <div className="relative">
                <Tag className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <select
                  id="ep-categoria"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-11 text-sm text-white/80 outline-none transition focus:border-secondary/50 focus:bg-white/8"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="" className="bg-[#1d2b45]">
                    Sem categoria
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#1d2b45]">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Time */}
          {teams.length > 0 && (
            <div>
              <label htmlFor="ep-time" className={LABEL_CLS}>
                Time
              </label>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <select
                  id="ep-time"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-11 text-sm text-white/80 outline-none transition focus:border-secondary/50 focus:bg-white/8"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="" className="bg-[#1d2b45]">
                    Sem time
                  </option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#1d2b45]">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !fullName.trim()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
            style={{
              background: saving || !fullName.trim() ? '#cdfd5199' : '#cdfd51',
            }}
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                Salvando…
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Salvo!
              </>
            ) : (
              'Salvar alterações'
            )}
          </button>
        </form>

        {/* Zona de perigo — exclusão de conta (LGPD) */}
        <div className="mt-10 rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <h2 className="font-display text-sm font-bold text-red-300">
                Excluir conta
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Esta ação é permanente. Todos os seus dados (perfil, contato e
                papéis) serão apagados e não poderão ser recuperados.
              </p>
            </div>
          </div>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mt-4 w-full rounded-2xl border border-red-500/40 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 active:scale-95"
            >
              Excluir minha conta
            </button>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-white/70">
                Tem certeza? Não dá para desfazer.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/5 active:scale-95 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white transition hover:bg-red-600 active:scale-95 disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Excluindo…
                    </>
                  ) : (
                    'Sim, excluir'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
