import { redirect } from 'next/navigation'

export const metadata = { title: 'Mensagens' }

export default function ComunidadePage() {
  redirect('/mensagens')
}
