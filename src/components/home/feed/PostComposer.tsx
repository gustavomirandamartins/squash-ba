'use client'

/**
 * PostComposer — caixa de criação de post do feed da comunidade.
 *
 * Mídia (uma por post, com prioridade para a foto):
 *   • Foto  → comprimida no browser (compressImage) e enviada ao bucket 'community'.
 *   • Vídeo/link → detectado automaticamente da primeira URL no texto; só a URL
 *     é guardada (embed), nada é hospedado — economiza espaço no plano gratuito.
 *
 * Inserção direta via browser client (RLS garante author_id = auth.uid()),
 * mesmo padrão do upload de avatar. Após publicar, chama onPosted() para o pai
 * recarregar o feed (router.refresh).
 */

import { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ImagePlus, Loader2, X, Send, MonitorPlay, Camera, Link2, UserRound } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { extractFirstUrl, parseMediaUrl, prettyDomain } from './embed'

const MAX = 2000

export function PostComposer({
  userId,
  userName,
  userAvatar,
  onPosted,
}: {
  userId: string
  userName: string | null
  userAvatar: string | null
  onPosted: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [body, setBody] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Vídeo/link detectado no texto (ignorado quando há foto).
  const detected = useMemo(() => {
    if (photo) return null
    const url = extractFirstUrl(body)
    return url ? parseMediaUrl(url) : null
  }, [body, photo])

  const canPost = (body.trim().length > 0 || !!photo || !!detected) && !posting && !compressing

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo
    if (!file) return
    setError(null)
    setCompressing(true)
    try {
      // 1080px / ~350KB — qualidade boa de feed sem pesar no bucket.
      const compressed = await compressImage(file, 1080, 350)
      setPhoto(compressed)
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(compressed)
      })
    } catch {
      setError('Não foi possível processar a imagem.')
    } finally {
      setCompressing(false)
    }
  }

  function clearPhoto() {
    setPhoto(null)
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  function reset() {
    setBody('')
    clearPhoto()
    setError(null)
    setExpanded(false)
  }

  async function submit() {
    if (!canPost) return
    setPosting(true)
    setError(null)
    const supabase = createClient()
    try {
      let imagePath: string | null = null

      if (photo) {
        imagePath = `${userId}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage
          .from('community')
          .upload(imagePath, photo, { contentType: 'image/jpeg', upsert: false })
        if (upErr) throw new Error('Falha ao enviar a foto.')
      }

      const embed = !photo && detected ? detected : null

      const { error: insErr } = await supabase.from('community_posts').insert({
        author_id: userId,
        body: body.trim() || null,
        image_path: imagePath,
        embed_url: embed?.url ?? null,
        embed_provider: embed?.provider ?? null,
      })
      if (insErr) {
        // rollback da foto órfã
        if (imagePath) await supabase.storage.from('community').remove([imagePath])
        throw new Error('Não foi possível publicar.')
      }

      reset()
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar.')
    } finally {
      setPosting(false)
    }
  }

  // ── Estado recolhido: gatilho compacto p/ economizar espaço na home ──────────
  if (!expanded) {
    return (
      <div className="glass glass-card flex items-center gap-3 px-3.5 py-3">
        <Avatar name={userName} url={userAvatar} />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex-1 rounded-full bg-white/[0.05] px-4 py-2.5 text-left text-sm text-white/35 ring-1 ring-white/8 transition hover:bg-white/[0.08]"
        >
          Compartilhe algo com a comunidade…
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(true)
            requestAnimationFrame(() => fileRef.current?.click())
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary/12 text-secondary transition active:scale-90"
          aria-label="Adicionar foto"
        >
          <ImagePlus className="h-4.5 w-4.5" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
      </div>
    )
  }

  // ── Estado expandido ─────────────────────────────────────────────────────────
  return (
    <div className="glass glass-card space-y-3 px-3.5 py-3.5">
      <div className="flex items-start gap-3">
        <Avatar name={userName} url={userAvatar} />
        <textarea
          autoFocus
          value={body}
          maxLength={MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compartilhe algo com a comunidade…"
          rows={3}
          className="min-h-[72px] flex-1 resize-none bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
      </div>

      {/* Pré-visualização da foto */}
      {photoPreview && (
        <div className="relative overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoPreview} alt="Pré-visualização" className="max-h-72 w-full object-cover" />
          <button
            type="button"
            onClick={clearPhoto}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition active:scale-90"
            aria-label="Remover foto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Chip do vídeo/link detectado */}
      {detected && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60">
          {detected.provider === 'youtube' && <MonitorPlay className="h-4 w-4 shrink-0 text-red-400" />}
          {detected.provider === 'instagram' && <Camera className="h-4 w-4 shrink-0 text-pink-400" />}
          {detected.provider === 'link' && <Link2 className="h-4 w-4 shrink-0 text-secondary" />}
          <span className="truncate">
            {detected.provider === 'youtube' && 'Vídeo do YouTube'}
            {detected.provider === 'instagram' && 'Post do Instagram'}
            {detected.provider === 'link' && prettyDomain(detected.url)}
          </span>
          <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-white/30">será incorporado</span>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={compressing || posting}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/55 transition hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-40"
          >
            {compressing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            Foto
          </button>
          {body.length > MAX - 200 && (
            <span className="text-[11px] text-white/30">{MAX - body.length}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={reset}
            disabled={posting}
            className="rounded-full px-3 py-2 text-xs font-semibold text-white/45 transition hover:text-white/70 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canPost}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-xs font-bold text-primary transition active:scale-95 disabled:opacity-40"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publicar
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
    </div>
  )
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/10"
      />
    )
  }
  const initial = (name ?? '?').trim().charAt(0).toUpperCase()
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.08] text-sm font-bold text-white/60 ring-1 ring-white/10">
      {initial || <UserRound className="h-5 w-5" />}
    </div>
  )
}
