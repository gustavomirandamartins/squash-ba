import Link from 'next/link'
import {
  MessageSquare,
  Swords,
  Trophy,
  CheckCircle2,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

export interface LembretesData {
  unread: number
  champInvites: { id: string; name: string }[]
  challengeInvites: { id: string; name: string; challenger: string | null }[]
  activeCount: number
}

function Item({
  href,
  icon: Icon,
  children,
}: {
  href: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3 transition active:scale-[0.985] hover:bg-white/[0.07]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/12">
        <Icon className="h-4 w-4 text-secondary" />
      </span>
      <span className="flex-1 text-sm text-white/85">{children}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
    </Link>
  )
}

export function Lembretes({ data }: { data: LembretesData }) {
  const { unread, champInvites, challengeInvites, activeCount } = data
  const empty =
    unread === 0 && champInvites.length === 0 && challengeInvites.length === 0 && activeCount === 0

  return (
    <section className="px-5">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">Lembretes</h2>
      <div className="space-y-1.5">
        {empty && (
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3 text-sm text-white/45">
            <CheckCircle2 className="h-4 w-4 text-secondary/70" />
            Tudo em dia por aqui.
          </div>
        )}

        {unread > 0 && (
          <Item href="/mensagens" icon={MessageSquare}>
            Você tem <strong className="font-bold text-white">{unread}</strong>{' '}
            {unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}
          </Item>
        )}

        {challengeInvites.map((c) => (
          <Item key={c.id} href={`/desafios/${c.id}`} icon={Swords}>
            <strong className="font-bold text-white">{c.challenger ?? 'Alguém'}</strong> te desafiou
          </Item>
        ))}

        {champInvites.map((c) => (
          <Item key={c.id} href={`/campeonatos/${c.id}`} icon={Trophy}>
            Convite para <strong className="font-bold text-white">{c.name}</strong>
          </Item>
        ))}

        {activeCount > 0 && (
          <Item href="/jogos" icon={Trophy}>
            Você está em <strong className="font-bold text-white">{activeCount}</strong>{' '}
            {activeCount === 1 ? 'campeonato ativo' : 'campeonatos ativos'}
          </Item>
        )}
      </div>
    </section>
  )
}
