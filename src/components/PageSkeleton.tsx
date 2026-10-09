/**
 * PageSkeleton — esqueleto mostrado pelos loading.tsx enquanto o servidor monta
 * a página. Sem ele, o toque na navegação deixava a tela parada até a resposta
 * inteira chegar (e o Next não pré-buscava as rotas dinâmicas).
 *
 * Segue o padrão visual das páginas: título (ícone + texto) e cards glass.
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-full bg-white/[0.07] ${className}`} />
}

function TitleSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-5 w-5 rounded-md bg-secondary/25" />
      <Bar className="h-5 w-36" />
    </div>
  )
}

function CardRow() {
  return (
    <div className="glass glass-card flex items-center gap-3 px-3.5 py-3">
      <div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.07]" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bar className="h-3.5 w-2/3" />
        <Bar className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export function PageSkeleton({ variant = 'list' }: { variant?: 'list' | 'detail' | 'home' }) {
  return (
    <div
      className="animate-pulse space-y-4 px-5 py-4 motion-reduce:animate-none"
      role="status"
      aria-label="Carregando"
    >
      {variant === 'home' ? (
        <>
          <Bar className="h-8 w-56" />
          <div className="glass glass-card h-16" />
          <div className="glass glass-card h-36" />
          <TitleSkeleton />
          {Array.from({ length: 4 }, (_, i) => <CardRow key={i} />)}
        </>
      ) : variant === 'detail' ? (
        <>
          <TitleSkeleton />
          <div className="glass glass-card h-24" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }, (_, i) => <Bar key={i} className="h-9 w-24" />)}
          </div>
          {Array.from({ length: 5 }, (_, i) => <CardRow key={i} />)}
        </>
      ) : (
        <>
          <TitleSkeleton />
          {Array.from({ length: 6 }, (_, i) => <CardRow key={i} />)}
        </>
      )}
    </div>
  )
}

/** Esqueleto de uma seção (Home em streaming): título + linhas. */
export function SectionSkeleton({ rows = 2, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div
      className="animate-pulse space-y-3 px-5 motion-reduce:animate-none"
      role="status"
      aria-label="Carregando"
    >
      {title && <TitleSkeleton />}
      {Array.from({ length: rows }, (_, i) => <CardRow key={i} />)}
    </div>
  )
}
