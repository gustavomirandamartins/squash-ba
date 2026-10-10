import { createClient, getAuthUser } from '@/utils/supabase/server'
import { Flag } from 'lucide-react'
import { AdminReports, type AdminReport } from '@/components/admin/AdminReports'

export const metadata = { title: 'Denúncias — Admin' }

export default async function AdminDenunciasPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return null

  // Abertas primeiro, depois as já analisadas (mais recentes antes).
  const { data, error } = await supabase.rpc('get_content_reports')
  const reports = (data ?? []) as AdminReport[]
  const open = reports.filter((r) => r.status === 'aberta').length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-white/40" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">Denúncias</h2>
        <span className="ml-auto text-[11px] text-white/30">{open} abertas</span>
      </div>
      {error ? (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error.message}</p>
      ) : (
        <AdminReports reports={reports} />
      )}
    </div>
  )
}
