import Image from 'next/image'
import { createClient } from '@/utils/supabase/server'
import { saveBannerLink } from '@/app/admin/actions'
import { ImageIcon, Link2 } from 'lucide-react'

export const metadata = { title: 'Banners — Admin' }

export default async function AdminBannersPage() {
  const supabase = await createClient()

  const [{ data: bannerFiles }, { data: bannerLinks }] = await Promise.all([
    supabase.storage
      .from('sponsors')
      .list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } }),
    supabase.from('sponsor_banners').select('image_name, link_url'),
  ])

  const linkByName = new Map(
    (
      (bannerLinks ?? []) as Array<{ image_name: string; link_url: string | null }>
    ).map((r) => [r.image_name, r.link_url]),
  )

  const banners = (bannerFiles ?? [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({
      name: f.name,
      url: supabase.storage.from('sponsors').getPublicUrl(f.name).data.publicUrl,
      link: linkByName.get(f.name) ?? '',
    }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-white/40" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Banners do patrocinador
        </h2>
      </div>

      <p className="text-xs text-white/35">
        Suba as imagens no bucket{' '}
        <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/55">sponsors</code>{' '}
        do Supabase. Aqui você define o link de destino de cada banner.
      </p>

      {banners.length === 0 ? (
        <div className="glass glass-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <ImageIcon className="h-8 w-8 text-white/20" />
          <p className="text-sm text-white/45">Nenhuma imagem no bucket ainda.</p>
          <p className="text-xs text-white/30">
            Acesse o Supabase Storage → bucket{' '}
            <span className="font-mono text-white/45">sponsors</span> e faça o
            upload das imagens.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {banners.map((b) => (
            <li key={b.name} className="glass glass-card p-3">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                  <Image
                    src={b.url}
                    alt={b.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <p className="min-w-0 flex-1 truncate text-xs text-white/60">
                  {b.name}
                </p>
              </div>
              <form action={saveBannerLink} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="image_name" value={b.name} />
                <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-white/30" />
                  <input
                    name="link_url"
                    type="url"
                    defaultValue={b.link ?? ''}
                    placeholder="https://patrocinador.com"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-primary transition active:scale-95"
                  style={{ background: '#cdfd51' }}
                >
                  Salvar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
