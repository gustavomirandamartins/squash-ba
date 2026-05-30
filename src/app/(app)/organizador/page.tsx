import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { Trophy, Clock, XCircle, CheckCircle, ShieldCheck } from 'lucide-react'

export const metadata = { title: 'Ser professor' }

// ── Server action: insere solicitação ────────────────────────────────────────
async function requestOrganizer() {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // unique(user_id): código 23505 = unique_violation — ignora silenciosamente
  const { error } = await supabase
    .from('organizer_requests')
    .insert({ user_id: user.id })
  if (error && error.code !== '23505') throw new Error(error.message)

  revalidatePath('/organizador')
}

// ── Componentes de estado ─────────────────────────────────────────────────────
function StatusCard({
  icon,
  title,
  description,
  accent = false,
}: {
  icon: React.ReactNode
  title: string
  description: string
  accent?: boolean
}) {
  return (
    <div className="glass glass-card p-8 text-center">
      <div
        className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full"
        style={{
          background: accent
            ? 'rgba(205,253,81,0.15)'
            : 'rgba(255,255,255,0.06)',
        }}
      >
        {icon}
      </div>
      <h2 className="mb-2 font-display text-lg font-bold text-white">{title}</h2>
      <p className="text-sm leading-relaxed text-white/55">{description}</p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function OrganizadorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 1. Verifica se já é professor (role = organizer)
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'organizer')
    .maybeSingle()

  if (roleRow) {
    return (
      <div className="px-5 py-8">
        <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-white">
          Ser professor
        </h1>
        <StatusCard
          accent
          icon={<ShieldCheck className="h-8 w-8 text-secondary" />}
          title="Você já é professor"
          description="Seu acesso de professor está ativo. Você pode criar e gerenciar campeonatos."
        />
      </div>
    )
  }

  // 2. Verifica pedido existente
  const { data: request } = await supabase
    .from('organizer_requests')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (request?.status === 'pending') {
    return (
      <div className="px-5 py-8">
        <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-white">
          Ser professor
        </h1>
        <StatusCard
          icon={<Clock className="h-8 w-8 text-white/50" />}
          title="Solicitação em análise"
          description="Seu pedido foi enviado e está sendo analisado pela equipe do SquashBa. Entraremos em contato em breve."
        />
      </div>
    )
  }

  if (request?.status === 'rejected') {
    return (
      <div className="px-5 py-8">
        <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-white">
          Ser professor
        </h1>
        <StatusCard
          icon={<XCircle className="h-8 w-8 text-red-400/70" />}
          title="Solicitação não aprovada"
          description="Infelizmente sua solicitação não foi aprovada desta vez. Entre em contato com a equipe para mais informações."
        />
      </div>
    )
  }

  // 3. Sem pedido — exibe botão
  return (
    <div className="px-5 py-8">
      <h1 className="mb-2 font-display text-2xl font-extrabold tracking-tight text-white">
        Ser professor
      </h1>
      <p className="mb-8 text-sm text-white/55">
        Professores podem criar campeonatos, cadastrar partidas e gerenciar chaves.
      </p>

      <div className="glass glass-card p-7">
        <div
          className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full"
          style={{ background: 'rgba(205,253,81,0.12)' }}
        >
          <Trophy className="h-8 w-8 text-secondary" />
        </div>

        <h2 className="mb-2 text-center font-display text-lg font-bold text-white">
          Quero organizar campeonatos
        </h2>
        <p className="mb-7 text-center text-sm leading-relaxed text-white/55">
          Sua solicitação será analisada pela equipe do SquashBa. Você será
          notificado quando aprovado.
        </p>

        <form action={requestOrganizer}>
          <button
            type="submit"
            className="w-full rounded-2xl py-3.5 font-display text-sm font-bold text-primary transition active:scale-95"
            style={{ background: '#cdfd51' }}
          >
            Quero ser professor
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border border-white/8 bg-white/3 px-5 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-secondary/70" />
          <p className="text-xs leading-relaxed text-white/45">
            Ao solicitar, você concorda com as diretrizes de organização do SquashBa e
            se compromete a manter as informações dos campeonatos atualizadas.
          </p>
        </div>
      </div>
    </div>
  )
}
