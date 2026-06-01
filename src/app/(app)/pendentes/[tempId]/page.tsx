'use client'

import { useParams } from 'next/navigation'
import { ProvisionalChampionship } from '@/components/offline/ProvisionalChampionship'

export default function PendingDetailPage() {
  const { tempId } = useParams<{ tempId: string }>()
  return <ProvisionalChampionship tempId={tempId} />
}
