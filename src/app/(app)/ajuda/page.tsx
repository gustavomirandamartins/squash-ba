import Link from 'next/link'
import {
  ChevronLeft, BookOpen, Shield, MessageSquarePlus,
  Heart, ChevronRight, Wifi, Trophy, Swords, Users,
  BarChart2, Smartphone,
} from 'lucide-react'
import { FeedbackForm } from '@/components/ajuda/FeedbackForm'

export const metadata = { title: 'Ajuda' }

// ── Dados estáticos ────────────────────────────────────────────────────────────

const INSTRUCOES = [
  {
    icon: Trophy,
    title: 'Campeonatos',
    steps: [
      'Acesse "Campeonatos" no menu inferior.',
      'Toque em "+" para criar: escolha formato (Liga, Eliminatória ou Grupos + Elim.), jogadores e configurações de placar.',
      'Ative o campeonato para gerar as partidas automaticamente.',
      'Toque em uma partida para lançar o placar em tempo real.',
    ],
  },
  {
    icon: Swords,
    title: 'Desafios',
    steps: [
      'Acesse "Desafios" no menu inferior.',
      'Crie um desafio 1v1, duplas ou por times.',
      'O adversário receberá um convite e poderá aceitar ou recusar.',
      'Após a aceitação, o desafio começa e as partidas são geradas.',
    ],
  },
  {
    icon: BarChart2,
    title: 'Placar & Classificação',
    steps: [
      'Toque em uma partida para abrir a tela de placar.',
      'Use os botões "+" de cada lado para incrementar pontos.',
      'O app detecta automaticamente o fim do set e da partida.',
      'A classificação é atualizada em tempo real.',
    ],
  },
  {
    icon: Wifi,
    title: 'Uso offline',
    steps: [
      'O app funciona sem internet após o primeiro acesso.',
      'Instale na tela de início para melhor experiência offline.',
      'Campeonatos criados offline ficam "Provisórios" até sincronizar.',
      'Ao reconectar, tudo é sincronizado automaticamente.',
    ],
  },
  {
    icon: Users,
    title: 'Comunidade',
    steps: [
      'Veja todos os jogadores cadastrados em "Comunidade".',
      'Toque em um jogador para ver o perfil e estatísticas.',
      'Use o chat para se comunicar diretamente com outros jogadores.',
    ],
  },
  {
    icon: Smartphone,
    title: 'Instalar o app',
    steps: [
      'iPhone/iPad: abra no Safari → botão Compartilhar → "Adicionar à Tela de Início".',
      'Android: abra no Chrome → menu ⋮ → "Adicionar à tela inicial".',
      'O ícone aparecerá na tela de início como um app nativo.',
    ],
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AjudaPage() {
  return (
    <div className="px-5 py-4 space-y-8 pb-10">
      {/* Voltar */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
      >
        <ChevronLeft className="h-4 w-4" />
        Início
      </Link>

      {/* Título */}
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Ajuda</h1>
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
        <div className="space-y-3 text-sm text-white/60 leading-relaxed">
          <p>
            O SquashBa coleta apenas os dados necessários para o funcionamento do app:
            nome, e-mail e foto de perfil. Nenhum dado é vendido ou compartilhado com
            terceiros.
          </p>
          <p>
            <strong className="text-white/80">Cookies:</strong> utilizamos apenas
            cookies de sessão para autenticação. Nenhum cookie de rastreamento ou
            publicidade é usado.
          </p>
          <p>
            <strong className="text-white/80">Dados offline:</strong> partidas e
            campeonatos podem ser armazenados localmente no seu dispositivo
            (IndexedDB) para funcionamento sem internet. Esses dados são sincronizados
            ao reconectar e podem ser apagados limpando os dados do site no navegador.
          </p>
          <p>
            <strong className="text-white/80">Exclusão de conta:</strong> para apagar
            sua conta e todos os dados associados, entre em contato via feedback abaixo.
          </p>
          <Link
            href="/privacidade"
            className="inline-flex items-center gap-1 text-secondary/80 hover:text-secondary transition"
          >
            Ver política completa
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
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
            Ideado, projetado e construído para a comunidade de squash da Bahia.
          </p>
          <p className="text-white/35 text-xs pt-1">
            © {new Date().getFullYear()} Gustavo Martins. Todos os direitos reservados.
          </p>
          <p className="text-white/25 text-xs">
            SquashBa · Beta 0.{process.env.NEXT_PUBLIC_COMMIT_COUNT ?? '?'}
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
