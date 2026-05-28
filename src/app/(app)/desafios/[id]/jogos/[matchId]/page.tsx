import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const metadata = { title: 'Placar' }

// Stub — será implementado no CP3 (useScoreEngine)
export default async function DesafioScorePage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>
}) {
  const { id } = await params

  return (
    <div className="px-5 py-4 space-y-4">
      <Link
        href={`/desafios/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar ao desafio
      </Link>

      <div className="glass glass-card px-4 py-10 text-center space-y-2">
        <p className="text-sm font-medium text-white/35">Placar de toque</p>
        <p className="text-xs text-white/25">Em construção — CP3</p>
      </div>
    </div>
  )
}
