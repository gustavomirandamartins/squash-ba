'use client'

/**
 * Tempo real de UM campeonato (classificação, chave, grupos).
 *
 * - `matches` é filtrado no servidor por championship_id.
 * - `match_games` não tem championship_id, então não dá para filtrar no
 *   servidor: o evento chega para qualquer ponto de qualquer quadra. Aqui ele é
 *   descartado se a partida não for deste campeonato (conjunto de ids mantido
 *   em ref e renovado a cada disparo — cobre partidas criadas depois, como a
 *   chave gerada ao fim dos grupos).
 * - Disparos próximos são agrupados (debounce): um ponto gera vários eventos
 *   (match_games + matches), mas só uma recarga.
 */

import { useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

const DEBOUNCE_MS = 700

export function useChampionshipRealtime(
  supabase: SupabaseClient,
  championshipId: string,
  channelName: string,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const matchIds = new Set<string>()

    async function loadMatchIds() {
      const { data } = await supabase
        .from('matches')
        .select('id')
        .eq('championship_id', championshipId)
      if (cancelled || !data) return
      matchIds.clear()
      for (const m of data as Array<{ id: string }>) matchIds.add(m.id)
    }
    void loadMatchIds()

    function schedule() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (cancelled) return
        onChangeRef.current()
        void loadMatchIds()
      }, DEBOUNCE_MS)
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `championship_id=eq.${championshipId}` },
        schedule,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_games' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { match_id?: string } | null
          const id = row?.match_id ?? (payload.old as { match_id?: string } | null)?.match_id
          if (id && matchIds.has(id)) schedule()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [supabase, championshipId, channelName])
}
