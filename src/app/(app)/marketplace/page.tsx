import { createClient } from '@/utils/supabase/server'
import { TeachersSection, type Teacher } from '@/components/home/TeachersSection'
import { Phone, Mail, MapPin, ShoppingBag, Store } from 'lucide-react'

export const metadata = { title: 'Marketplace' }

type Ad = {
  id: string
  name: string
  product_service: string
  phone: string | null
  email: string | null
  address: string | null
}

export default async function MarketplacePage() {
  const supabase = await createClient()

  const [organizersRes, adsRes] = await Promise.all([
    supabase.from('user_roles').select('user_id').eq('role', 'organizer'),
    supabase
      .from('ads')
      .select('id, name, product_service, phone, email, address')
      .eq('active', true)
      .order('ordering', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  // Perfis dos professores
  const organizerIds = (organizersRes.data ?? []).map((r: { user_id: string }) => r.user_id)
  const { data: teacherProfiles } = organizerIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', organizerIds)
    : { data: [] }

  const teachers: Teacher[] = (teacherProfiles ?? []) as Teacher[]
  const ads: Ad[] = (adsRes.data ?? []) as Ad[]

  return (
    <div className="py-4 space-y-8">
      {/* Header */}
      <div className="px-5 flex items-center gap-2">
        <Store className="h-5 w-5 text-secondary" />
        <h1 className="font-display text-xl font-extrabold text-white">Marketplace</h1>
      </div>

      {/* ── Professores ──────────────────────────────────────────────── */}
      {teachers.length > 0 ? (
        <div className="space-y-1">
          <p className="px-6 text-[11px] font-semibold uppercase tracking-widest text-white/35">
            Professores
          </p>
          <TeachersSection teachers={teachers} />
        </div>
      ) : (
        <div className="px-5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
            Professores
          </p>
          <div className="glass glass-card px-4 py-8 text-center text-sm text-white/30">
            Nenhum professor cadastrado ainda.
          </div>
        </div>
      )}

      {/* ── Anúncios ─────────────────────────────────────────────────── */}
      <div className="px-5 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
          Produtos &amp; Serviços
        </p>

        {ads.length === 0 ? (
          <div className="glass glass-card px-4 py-8 text-center text-sm text-white/30">
            Nenhum anúncio disponível no momento.
          </div>
        ) : (
          <div className="space-y-3">
            {ads.map((ad) => (
              <div key={ad.id} className="glass glass-card px-4 py-4 space-y-2.5">
                {/* Nome + produto */}
                <div>
                  <p className="font-semibold text-white/90">{ad.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <ShoppingBag className="h-3 w-3 shrink-0 text-secondary/60" />
                    <p className="text-sm text-secondary/80">{ad.product_service}</p>
                  </div>
                </div>

                {/* Contatos */}
                <div className="space-y-1.5">
                  {ad.phone && (
                    <a
                      href={`tel:${ad.phone.replace(/\D/g, '')}`}
                      className="flex items-center gap-2 text-sm text-white/60 transition hover:text-white/85"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-white/30" />
                      {ad.phone}
                    </a>
                  )}
                  {ad.email && (
                    <a
                      href={`mailto:${ad.email}`}
                      className="flex items-center gap-2 text-sm text-white/60 transition hover:text-white/85"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-white/30" />
                      {ad.email}
                    </a>
                  )}
                  {ad.address && (
                    <p className="flex items-start gap-2 text-sm text-white/50">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
                      {ad.address}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
