'use client'

// Entrada em cascata da Home só na PRIMEIRA abertura do app. Nas voltas à Home
// (navegação dentro do app) o conteúdo aparece direto — antes, cada volta
// esperava a cascata inteira (~1 s) para mostrar o que já estava pronto.
//
// `firstOpen` vive no módulo: vale para esta carga do app. No servidor nunca
// muda (o efeito não roda lá), então o HTML inicial e a hidratação batem.

import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react'

let firstOpen = true

const STEP_MS = 25 // cascata total ≤ 150 ms (7 seções)

export function HomeReveal({ children }: { children: ReactNode }) {
  const [animate] = useState(() => firstOpen)

  useEffect(() => {
    firstOpen = false
  }, [])

  return (
    <div className="flex flex-col gap-6 pt-2">
      {Children.toArray(children).map((node, i) => (
        <div
          key={isValidElement(node) && node.key != null ? node.key : i}
          className={animate ? 'reveal' : undefined}
          style={animate ? { animationDelay: `${i * STEP_MS}ms` } : undefined}
        >
          {node}
        </div>
      ))}
    </div>
  )
}
