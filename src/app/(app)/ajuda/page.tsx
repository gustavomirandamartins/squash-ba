import {
  CircleHelp, BookOpen, Shield, MessageSquarePlus,
  Heart, ChevronRight, Wifi, Trophy, Swords, Users,
  BarChart2, Smartphone, Store,
} from 'lucide-react'
import { FeedbackForm } from '@/components/ajuda/FeedbackForm'

export const metadata = { title: 'Ajuda' }

// ── Dados estáticos ────────────────────────────────────────────────────────────

const INSTRUCOES = [
  {
    icon: Trophy,
    title: 'Campeonatos & Desafios',
    steps: [
      'Acesse "Campeonatos" no menu inferior.',
      'Toque em "+" para criar e escolha o formato: Liga, Eliminatórias, Grupos + Elim. ou Desafio.',
      'Liga: todos jogam entre si, classificação por pontos.',
      'Eliminatórias: chaveamento direto — quem perde é eliminado.',
      'Grupos + Elim.: fase de grupos seguida de eliminatórias.',
      'Desafio: confronto direto entre dois lados — 1v1, duplas ou times. Ao selecionar, você será direcionado para configurar os participantes.',
      'Ative o campeonato para gerar as partidas automaticamente.',
    ],
  },
  {
    icon: Swords,
    title: 'Seus desafios e campeonatos',
    steps: [
      'Na página Campeonatos, além dos campeonatos gerais, seus desafios aparecem na seção "Meus desafios".',
      'Toque em qualquer item para acompanhar partidas, placares e classificação.',
      'Desafios 1v1: o adversário recebe um convite e pode aceitar ou recusar.',
      'Desafios por duplas ou times: todos os jogadores entram confirmados imediatamente.',
    ],
  },
  {
    icon: BarChart2,
    title: 'Placar & Classificação',
    steps: [
      'Toque em uma partida para abrir a tela de placar.',
      'Use os botões "+" de cada lado para pontuar.',
      'MD3: o primeiro a vencer 2 sets ganha — se ficar 1×1, há um 3º set decisivo.',
      'MD5: o primeiro a vencer 3 sets ganha — se ficar 2×2, há um 5º set decisivo.',
      'O app detecta automaticamente o fim do set e encerra a partida quando um lado atinge os sets necessários.',
      'A classificação é atualizada em tempo real.',
    ],
  },
  {
    icon: Store,
    title: 'Marketplace',
    steps: [
      'Acesse "Marketplace" no menu inferior.',
      'Encontre professores de squash disponíveis para aulas — toque em "Contato" para abrir um chat direto.',
      'Veja fornecedores de produtos e serviços relacionados ao esporte: academias, equipamentos, cordas e mais.',
    ],
  },
  {
    icon: Wifi,
    title: 'Uso offline',
    steps: [
      'O app funciona sem internet após o primeiro acesso.',
      'Instale na tela de início (veja seção abaixo) para melhor experiência offline.',
      'Campeonatos criados offline ficam como "Provisórios" até reconectar.',
      'Placares lançados offline são sincronizados automaticamente ao voltar online.',
    ],
  },
  {
    icon: Users,
    title: 'Comunidade',
    steps: [
      'Acesse "Comunidade" no menu para ver todos os jogadores cadastrados.',
      'Toque em um jogador para ver perfil, estatísticas e histórico de partidas.',
      'Use o ícone de mensagem para iniciar um chat direto.',
    ],
  },
  {
    icon: Smartphone,
    title: 'Instalar o app',
    steps: [
      'Na tela inicial, toque no banner "Instale para funcionalidade extra".',
      'iPhone/iPad: abra no Safari → botão Compartilhar ↑ → "Adicionar à Tela de Início" → Adicionar.',
      'Android: abra no Chrome → menu ⋮ → "Adicionar à tela inicial" ou "Instalar app" → Confirmar.',
      'Após instalar, o app abre em tela cheia, sem barra do navegador, com melhor performance offline.',
    ],
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AjudaPage() {
  return (
    <div className="px-5 py-4 space-y-8 pb-10">
      {/* Título */}
      <div>
        <h1 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <CircleHelp className="h-5 w-5 text-secondary" />
          Ajuda
        </h1>
        <p className="mt-1 text-sm text-white/40">Instruções, termos e suporte</p>
      </div>

      {/* ── 1. Instruções de uso ─────────────────────────────────────────────── */}
      <Section icon={BookOpen} title="Instruções de uso">
        <div className="space-y-3">
          {INSTRUCOES.map(({ icon: Icon, title, steps }) => (
            <details key={title} className="glass glass-card group overflow-hidden">
              <summary className="flex cursor-pointer select-none list-none items-center gap-3 px-4 py-3">
                <Icon className="h-4 w-4 shrink-0 text-secondary/70" />
                <span className="flex-1 text-sm font-semibold text-white/85">{title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-open:rotate-90" />
              </summary>
              <div className="space-y-1.5 px-4 pb-4 pt-1">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/12 text-[10px] font-bold text-secondary">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-white/60">{s}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Section>

      {/* ── 2. Termos e privacidade ──────────────────────────────────────────── */}
      <Section icon={Shield} title="Termos, cookies e privacidade">
        <div className="space-y-3">
          <p className="text-sm text-white/60 leading-relaxed">
            Confira nossa Política de Privacidade completa, em conformidade com a LGPD.
          </p>
          <a
            href="https://squashba.gustavomartins.com/privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className="glass glass-card flex items-center justify-between px-4 py-3.5 transition hover:border-white/20 active:scale-[0.985]"
          >
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 shrink-0 text-secondary/70" />
              <span className="text-sm font-semibold text-white/85">Política de Privacidade</span>
            </div>
            <ChevronRight className="h-4 w-4 text-white/25" />
          </a>
        </div>
      </Section>

      {/* ── 3. Feedback ─────────────────────────────────────────────────────── */}
      <Section icon={MessageSquarePlus} title="Feedback">
        <div className="space-y-3">
          <p className="text-sm text-white/50 leading-relaxed">
            Encontrou um bug? Tem uma sugestão? Quer deixar um comentário?
            Envie abaixo.
          </p>
          <FeedbackForm />
        </div>
      </Section>

      {/* ── 4. Créditos ──────────────────────────────────────────────────────── */}
      <Section icon={Heart} title="Créditos">
        <div className="space-y-2 text-sm text-white/60">
          <p>
            <strong className="text-white/85">Desenvolvido por</strong>{' '}
            <span className="text-secondary">Gustavo Martins</span>
          </p>
          <p>
            Idealizado, projetado e construído para a comunidade de squash da Bahia.
          </p>
          <p className="text-white/35 text-xs pt-1">
            © {new Date().getFullYear()} Gustavo Martins. Todos os direitos reservados.
          </p>
          <p className="text-white/25 text-xs">
            SquashBa · Beta {process.env.NEXT_PUBLIC_VERSION ?? '?'}
          </p>
        </div>
      </Section>
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Icon className="h-4 w-4 text-secondary/60" />
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}
