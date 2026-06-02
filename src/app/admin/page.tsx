import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { approveRequest, rejectRequest, saveBannerLink } from './actions'
import { ShieldCheck, User, CheckCircle, XCircle, ClipboardList, Megaphone, Link2, ArrowLeft, Users, MessageSquarePlus, ChevronRight } from 'lucide-react'
import { AdminUsers, type AdminUser } from '@/components/admin/AdminUsers'

export const metadata = { title: 'Painel admin' }

// ── Botões via server actions (formulários isolados por usuário) ──────────────
function ApproveButton({ userId }: { userId: string }) {
  return (
    <form
      action={async () => {
        'use server'
        await approveRequest(userId)
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-primary transition active:scale-95"
        style={{ background: '#cdfd51' }}
      >
        <CheckCircle className="h-3.5 w-3.5" />
        Aprovar
      </button>
    </form>
  )
}

function RejectButton({ userId }: { userId: string }) {
  return (
    <form
      action={async () => {
        'use server'
        await rejectRequest(userId)
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-xl border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 active:scale-95"
      >
        <XCircle className="h-3.5 w-3.5" />
        Rejeitar
      </button>
    </form>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function AdminPage() {
  const supabase = await createClient()

  // Valida sessão
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  // Verifica papel admin — se não for admin, retorna 404 sem revelar a rota
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!adminRole) notFound()

  // Lista pedidos pendentes. NÃO embutimos profiles aqui: organizer_requests.user_id
  // não tem FK para public.profiles (referencia auth.users), então o embed do PostgREST
  // falha e zera a lista. Buscamos os perfis em separado (mesmo padrão das outras telas).
  const { data: reqRows } = await supabase
    .from('organizer_requests')
    .select('user_id, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const reqUserIds = (reqRows ?? []).map((r) => r.user_id)
  const { data: reqProfiles } = reqUserIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', reqUserIds)
    : { data: [] }
  const profById = new Map(
    (reqProfiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p]),
  )
  const pending = (reqRows ?? []).map((r) => ({
    user_id: r.user_id,
    created_at: r.created_at,
    profile: profById.get(r.user_id) ?? null,
  }))

  // ── Usuários cadastrados + papéis + emails ─────────────────────────────────────
  const [{ data: allProfiles }, { data: allRoles }, { data: allEmails }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url').order('full_name'),
    supabase.from('user_roles').select('user_id, role'),
    supabase.from('profiles_private').select('user_id, email'),
  ])
  const rolesByUser = new Map<string, Set<string>>()
  for (const r of (allRoles ?? []) as Array<{ user_id: string; role: string }>) {
    const set = rolesByUser.get(r.user_id) ?? new Set<string>()
    set.add(r.role)
    rolesByUser.set(r.user_id, set)
  }
  const emailByUser = new Map<string, string | null>()
  for (const e of (allEmails ?? []) as Array<{ user_id: string; email: string | null }>) {
    emailByUser.set(e.user_id, e.email)
  }
  const users: AdminUser[] = (allProfiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => {
    const roles = rolesByUser.get(p.id)
    const role: AdminUser['role'] = roles?.has('admin')
      ? 'admin'
      : roles?.has('organizer')
        ? 'organizer'
        : 'jogador'
    return { id: p.id, name: p.full_name, email: emailByUser.get(p.id) ?? null, avatarUrl: p.avatar_url, role }
  })

  // ── Feedbacks novos (badge) ─────────────────────────────────────────────────
  const { count: novoFeedbackCount } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'novo')

  // ── Banners do patrocinador: imagens do bucket + link de cada uma ───────────
  const [{ data: bannerFiles }, { data: bannerLinks }] = await Promise.all([
    supabase.storage.from('sponsors').list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } }),
    supabase.from('sponsor_banners').select('image_name, link_url'),
  ])
  const linkByName = new Map(
    ((bannerLinks ?? []) as Array<{ image_name: string; link_url: string | null }>).map((r) => [r.image_name, r.link_url]),
  )
  const banners = (bannerFiles ?? [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({
      name: f.name,
      url: supabase.storage.from('sponsors').getPublicUrl(f.name).data.publicUrl,
      link: linkByName.get(f.name) ?? '',
    }))

  return (
    <div
      className="relative min-h-dvh px-5 py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-[480px]">
        {/* Voltar */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-white/55 transition hover:text-white active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao início
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: 'rgba(205,253,81,0.12)' }}
          >
            <ShieldCheck className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold tracking-tight text-white">
              Painel admin
            </h1>
            <p className="text-xs text-white/45">SquashBa — acesso restrito</p>
          </div>
        </div>

        {/* Atalhos de gerenciamento */}
        <div className="mb-8 space-y-2">
          <Link
            href="/gestao/anuncios"
            className="glass glass-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.985]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary/12">
              <Megaphone className="h-4 w-4 text-secondary" />
            </span>
            <span className="flex-1 text-sm font-semibold text-white/85">Anúncios</span>
            <ChevronRight className="h-4 w-4 text-white/25" />
          </Link>
          <Link
            href="/gestao/feedbacks"
            className="glass glass-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.985]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary/12">
              <MessageSquarePlus className="h-4 w-4 text-secondary" />
            </span>
            <span className="flex-1 text-sm font-semibold text-white/85">Feedbacks</span>
            {novoFeedbackCount ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-primary" style={{ background: '#cdfd51' }}>
                {novoFeedbackCount}
              </span>
            ) : null}
            <ChevronRight className="h-4 w-4 text-white/25" />
          </Link>
        </div>

        {/* Seção: pedidos pendentes */}
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-white/40" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Solicitações de professor
          </h2>
          {pending.length > 0 && (
            <span
              className="ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-primary"
              style={{ background: '#cdfd51' }}
            >
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="glass glass-card flex flex-col items-center gap-3 px-6 py-12 text-center">
            <CheckCircle className="h-8 w-8 text-white/20" />
            <p className="text-sm text-white/45">
              Nenhuma solicitação pendente no momento.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((req) => {
              const profile = req.profile
              const name = profile?.full_name ?? 'Usuário'
              const avatar = profile?.avatar_url ?? null
              const createdAt = new Date(req.created_at).toLocaleDateString(
                'pt-BR',
                { day: '2-digit', month: 'short', year: 'numeric' },
              )

              return (
                <li key={req.user_id} className="glass glass-card p-4">
                  <div className="mb-4 flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/15">
                      {avatar ? (
                        <Image
                          src={avatar}
                          alt={name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white/8">
                          <User className="h-5 w-5 text-white/40" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {name}
                      </p>
                      <p className="text-xs text-white/40">
                        Solicitado em {createdAt}
                      </p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2">
                    <ApproveButton userId={req.user_id} />
                    <RejectButton userId={req.user_id} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* Seção: usuários cadastrados */}
        <div className="mb-3 mt-10 flex items-center gap-2">
          <Users className="h-4 w-4 text-white/40" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Usuários
          </h2>
          <span className="ml-auto text-[11px] text-white/30">{users.length}</span>
        </div>
        <p className="mb-3 text-xs text-white/35">
          Remova o acesso de professor ou exclua usuários cadastrados.
        </p>
        <AdminUsers users={users} currentUserId={user.id} />

        {/* Seção: banners do patrocinador */}
        <div className="mb-3 mt-10 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-white/40" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Banners do patrocinador
          </h2>
        </div>
        <p className="mb-3 text-xs text-white/35">
          Suba as imagens no bucket <code className="text-white/55">sponsors</code> do Supabase. Aqui você define
          o link de destino de cada banner.
        </p>

        {banners.length === 0 ? (
          <div className="glass glass-card flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Megaphone className="h-8 w-8 text-white/20" />
            <p className="text-sm text-white/45">Nenhuma imagem no bucket ainda.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {banners.map((b) => (
              <li key={b.name} className="glass glass-card p-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                    <Image src={b.url} alt={b.name} fill className="object-cover" unoptimized />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-xs text-white/60">{b.name}</p>
                </div>
                <form action={saveBannerLink} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="image_name" value={b.name} />
                  <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-white/30" />
                    <input
                      name="link_url"
                      type="url"
                      defaultValue={b.link}
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
    </div>
  )
}
