// Recarga ao voltar ao app — no máximo uma vez a cada `minIntervalMs`.
//
// No iPhone o evento `focus` dispara a cada volta ao app (e às vezes em dobro,
// junto com `visibilitychange`). Sem limite, sino, contador e chat refaziam as
// consultas toda vez. Aqui: a primeira volta recarrega; as seguintes, só depois
// do intervalo. Retorna o cleanup.

export const APP_RETURN_INTERVAL_MS = 30_000

export function onAppReturn(fn: () => void, minIntervalMs = APP_RETURN_INTERVAL_MS): () => void {
  let last = Date.now() // quem chama já carregou ao montar
  const run = () => {
    if (document.visibilityState === 'hidden') return
    const now = Date.now()
    if (now - last < minIntervalMs) return
    last = now
    fn()
  }
  window.addEventListener('focus', run)
  document.addEventListener('visibilitychange', run)
  return () => {
    window.removeEventListener('focus', run)
    document.removeEventListener('visibilitychange', run)
  }
}
