'use client'

/**
 * global-error — último recurso: captura erros que escapam até do layout raiz.
 * Como substitui TODO o documento (inclusive <html>/<body>), não pode depender
 * de classes do globals.css (o layout que o importa não chega a renderizar).
 * Por isso os estilos são inline, com as cores da marca.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #2a364d 0%, #192339 100%)',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '22rem',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 24,
            padding: '2rem 1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            Erro inesperado
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', margin: '0 0 1.25rem' }}>
            Ocorreu uma falha ao iniciar o aplicativo. Tente recarregar.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 999,
              border: 'none',
              background: '#cdfd51',
              color: '#1d2b45',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
          {error.digest && (
            <p style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.75rem' }}>
              ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
