import { notFound } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { MessageSquare, Bug, Lightbulb, AlertTriangle, CheckCircle2, Clock, Eye, Trash2 } from 'lucide-react'
import { markFeedbackRead, deleteFeedback } from './actions'

export const metadata = { title: 'Feedbacks' }

type FeedbackRow = {
  id: string
  user_name: string | null
  message: string
  type: string
  status: string
  created_at: string
}

const TYPE_STYLE: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  bug:      { label: 'Bug',      icon: Bug,            cls: 'bg-red-500/12    text-red-400'     },
  sugestao: { label: 'Sugestão', icon: Lightbulb,      cls: 'bg-emerald-500/12 text-emerald-400' },
  critica:  { label: 'Crítica',  icon: AlertTriangle,  cls: 'bg-amber-500/12  text-amber-400'   },
  geral:    { label: 'Geral',    icon: MessageSquare,  cls: 'bg-sky-500/12    text-sky-400'     },
}

const STATUS_STYLE: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  novo:      { label: 'Novo',      icon: Clock,         cls: 'bg-secondary/12 text-secondary' },
  lido:      { label: 'Lido',      icon: Eye,           cls: 'bg-white/8      text-white/50'  },
  resolvido: { label: 'Resolvido', icon: CheckCircle2,  cls: 'bg-white/6      text-white/30'  },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function FeedbacksPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) notFound()

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
  const isAdmin = (roles ?? []).some((r) => r.role === 'admin')
  if (!isAdmin) notFound()

  const { data: rows } = await supabase
    .from('feedback')
    .select('id, user_name, message, type, status, created_at')
    .order('created_at', { ascending: false })

  const feedbacks = (rows ?? []) as FeedbackRow[]
  const novo = feedbacks.filter((f) => f.status === 'novo').length

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-extrabold text-white">Feedbacks</h1>
        {novo > 0 && (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-black text-primary">
            {novo} novo{novo > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {feedbacks.length === 0 ? (
        <div className="glass glass-card px-4 py-10 text-center text-sm text-white/30">
          Nenhum feedback recebido ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((fb) => {
            const t = TYPE_STYLE[fb.type] ?? TYPE_STYLE.geral
            const s = STATUS_STYLE[fb.status] ?? STATUS_STYLE.novo
            const TIcon = t.icon
            const SIcon = s.icon

            return (
              <div key={fb.id} className="glass glass-card space-y-3 px-4 py-4">
                {/* Linha topo */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${t.cls}`}>
                    <TIcon className="h-3 w-3" />
                    {t.label}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>
                    <SIcon className="h-3 w-3" />
                    {s.label}
                  </span>
                  <span className="ml-auto text-[11px] text-white/30">{formatDate(fb.created_at)}</span>
                </div>

                {/* Mensagem */}
                <p className="text-sm text-white/75 leading-relaxed">{fb.message}</p>

                {/* Rodapé: autor + ações */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-white/30">
                    Por {fb.user_name ?? 'Usuário anônimo'}
                  </p>
                  <div className="flex items-center gap-2">
                    {fb.status === 'novo' && (
                      <form action={markFeedbackRead}>
                        <input type="hidden" name="id" value={fb.id} />
                        <button
                          type="submit"
                          className="flex items-center gap-1 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:bg-white/12 active:scale-95"
                        >
                          <Eye className="h-3 w-3" />
                          Marcar como lido
                        </button>
                      </form>
                    )}
                    <form action={deleteFeedback}>
                      <input type="hidden" name="id" value={fb.id} />
                      <button
                        type="submit"
                        className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400/80 transition hover:bg-red-500/20 hover:text-red-400 active:scale-95"
                      >
                        <Trash2 className="h-3 w-3" />
                        Apagar
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
