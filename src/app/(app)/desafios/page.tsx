import { redirect } from 'next/navigation'

// Não há listagem própria de desafios: eles aparecem na seção "Meus desafios"
// dentro de /campeonatos. Vários fluxos (ManageBar após excluir, wizard quando
// o item fica na fila offline, ProvisionalChampionship, OfflinePreloader) fazem
// push('/desafios'); este redirect evita o 404 e centraliza o destino.
export default function DesafiosPage() {
  redirect('/campeonatos')
}
