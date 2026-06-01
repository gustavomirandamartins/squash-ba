import Link from 'next/link'
import { ChevronLeft, GitCommitHorizontal, Wrench, Zap, Settings2, Package } from 'lucide-react'
import changelogData from '@/data/changelog.json'

export const metadata = { title: 'Versão' }

type CommitEntry = { hash: string; subject: string; date: string }

// Classifica o commit pelo prefixo convencional do subject
function classifyCommit(subject: string): {
  type: 'feat' | 'fix' | 'infra' | 'other'
  label: string
  clean: string
} {
  const s = subject.trim()
  const lower = s.toLowerCase()

  // Extrai o texto limpo removendo prefixos convencionais
  const clean = s
    .replace(/^(feat|fix|ci|chore|refactor|docs|style|test|build|perf)(\([^)]+\))?:\s*/i, '')
    .trim()

  if (/^feat/i.test(s)) return { type: 'feat', label: 'Novo', clean }
  if (/^fix/i.test(s)) return { type: 'fix', label: 'Correção', clean }
  if (/^(ci|chore|build|infra)/i.test(s) || /deploy|vercel|env|config/i.test(lower))
    return { type: 'infra', label: 'Infra', clean }
  return { type: 'other', label: 'Melhoria', clean }
}

const TYPE_STYLES = {
  feat:  'bg-emerald-500/15 text-emerald-400',
  fix:   'bg-amber-500/15   text-amber-400',
  infra: 'bg-white/8        text-white/35',
  other: 'bg-sky-500/15     text-sky-400',
} as const

const TYPE_ICONS = {
  feat:  Zap,
  fix:   Wrench,
  infra: Settings2,
  other: Package,
} as const

// Agrupa commits por mês (YYYY-MM → "Maio 2026")
function formatMonth(isoDate: string) {
  if (!isoDate) return '—'
  const [year, month] = isoDate.split('-')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

function groupByMonth(commits: CommitEntry[]) {
  const groups = new Map<string, CommitEntry[]>()
  for (const c of commits) {
    const key = c.date.slice(0, 7) // YYYY-MM
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }
  return groups
}

export default function VersaoPage() {
  const { count, commits } = changelogData as { count: number; commits: CommitEntry[] }
  const groups = groupByMonth(commits)

  return (
    <div className="px-5 py-4 space-y-5 pb-8">
      {/* Voltar */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white/80"
      >
        <ChevronLeft className="h-4 w-4" />
        Início
      </Link>

      {/* Cabeçalho */}
      <div className="space-y-1">
        <div className="flex items-end gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white">
            Beta <span className="text-secondary">0.{count}</span>
          </h1>
          <span className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-secondary/12 px-2.5 py-1 text-[11px] font-semibold text-secondary">
            <GitCommitHorizontal className="h-3 w-3" />
            {count} commits
          </span>
        </div>
        <p className="text-sm text-white/40">
          Histórico de atualizações do SquashBa
        </p>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-2">
        {([['feat', 'Novo'], ['fix', 'Correção'], ['other', 'Melhoria'], ['infra', 'Infra']] as const).map(([t, l]) => (
          <span key={t} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TYPE_STYLES[t]}`}>
            {l}
          </span>
        ))}
      </div>

      {/* Lista por mês */}
      {[...groups.entries()].map(([monthKey, monthCommits]) => (
        <div key={monthKey} className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-white/30">
            {formatMonth(monthKey)}
          </p>
          <div className="space-y-1.5">
            {monthCommits.map((c) => {
              const { type, label, clean } = classifyCommit(c.subject)
              const Icon = TYPE_ICONS[type]
              if (type === 'infra') return null // oculta commits de infra por padrão
              return (
                <div
                  key={c.hash}
                  className="glass glass-card flex items-start gap-3 px-4 py-3"
                >
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TYPE_STYLES[type]}`}>
                    <Icon className="h-2.5 w-2.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-white/85">{clean}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-white/25">{c.hash} · {c.date}</p>
                  </div>
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_STYLES[type]}`}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="text-center text-xs text-white/20 pt-2">
        SquashBa · Versão Beta 0.{count}
      </p>
    </div>
  )
}
