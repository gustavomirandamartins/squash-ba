import { WifiOff } from 'lucide-react'

export const metadata = { title: 'Offline — SquashBa' }

// Página servida pelo service worker quando uma navegação falha offline e a
// rota não está no cache. Substitui o antigo fallback para a home (confuso).
export default function OfflinePage() {
  return (
    <div
      className="min-h-dvh grid place-items-center px-6 text-center"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #16233a 100%)',
      }}
    >
      <div className="max-w-xs space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary/12 grid place-items-center ring-1 ring-secondary/25">
          <WifiOff className="h-7 w-7 text-secondary/70" />
        </div>
        <h1 className="text-lg font-bold text-white">Você está offline</h1>
        <p className="text-sm text-white/55 leading-relaxed">
          Esta tela ainda não foi carregada offline. Abra-a uma vez com internet
          para que fique disponível sem conexão.
        </p>
        <p className="text-xs text-white/35">
          Placares já abertos continuam funcionando e sincronizam quando você
          voltar a ficar online.
        </p>
      </div>
    </div>
  )
}
