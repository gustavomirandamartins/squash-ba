/**
 * Gera e persiste um UUID de dispositivo no localStorage.
 * Seguro para SSR — retorna 'ssr' quando executado no servidor.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr'
  const KEY = 'squashba_device_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}
