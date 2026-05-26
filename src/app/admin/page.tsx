import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/server'
import { approveRequest, rejectRequest } from './actions'
import { ShieldCheck, User, CheckCircle, XCircle, ClipboardList } from 'lucide-react'

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

  // Lista pedidos pendentes com nome + avatar do solicitante
  const { data: requests } = await supabase
    .from('organizer_requests')
    .select(`
      user_id,
      created_at,
      profiles (
        full_name,
        avatar_url
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const pending = requests ?? []

  return (
    <div
      className="relative min-h-dvh px-5 py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-[480px]">
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

        {/* Seção: pedidos pendentes */}
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-white/40" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Solicitações pendentes
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
              const profile = Array.isArray(req.profiles)
                ? req.profiles[0]
                : req.profiles
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
      </div>
    </div>
  )
}
