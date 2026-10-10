import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { AdminNav } from '@/components/admin/AdminNav'

export const metadata = { title: 'Painel admin' }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const user = await getAuthUser()
  if (!user) notFound()

  // Verifica papel admin — se não for admin, retorna 404 sem revelar a rota
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!adminRole) notFound()

  // Badge de feedbacks novos para o nav
  // Badges do nav: feedbacks novos e denúncias abertas
  const [{ count: feedbackCount }, { count: reportCount }] = await Promise.all([
    supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'novo'),
    supabase.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
  ])

  return (
    <div
      className="min-h-dvh"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #1d2b45 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-[480px] px-5 pb-24 pt-[max(2.5rem,calc(var(--top-inset)+1rem))] lg:max-w-3xl">
        {/* Voltar */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-white/55 transition hover:text-white active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao início
        </Link>

        {/* Header */}
        <div className="mb-7 flex items-center gap-3">
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

        {/* Navegação por abas */}
        <AdminNav feedbackCount={feedbackCount ?? 0} reportCount={reportCount ?? 0} />

        {/* Conteúdo da aba */}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
