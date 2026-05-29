'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Megaphone, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Banner {
  src: string
  href: string | null
}

const ROTATE_MS = 10_000

export function SponsorBanner({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0)
  const count = banners.length

  const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count])

  // Rotação automática a cada 10s (pausa se houver 0/1 banner)
  useEffect(() => {
    if (count <= 1) return
    const t = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => clearInterval(t)
  }, [count])

  // Placeholder quando não há banners
  if (count === 0) {
    return (
      <div className="px-5">
        <div className="flex aspect-[16/6] w-full items-center justify-center rounded-3xl bg-gradient-to-br from-secondary/15 via-white/[0.04] to-transparent ring-1 ring-white/10">
          <div className="flex items-center gap-2 text-white/40">
            <Megaphone className="h-4 w-4" />
            <span className="text-xs font-medium">Espaço do patrocinador</span>
          </div>
        </div>
      </div>
    )
  }

  const current = banners[index]
  const Img = (
    <Image
      key={current.src}
      src={current.src}
      alt="Patrocinador"
      fill
      sizes="480px"
      className="object-cover"
      priority={index === 0}
    />
  )

  return (
    <div className="px-5">
      <div className="relative aspect-[16/6] w-full overflow-hidden rounded-3xl ring-1 ring-white/10">
        {current.href ? (
          <a href={current.href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 block">
            {Img}
          </a>
        ) : (
          Img
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Banner anterior"
              onClick={() => goTo(index - 1)}
              className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 active:scale-90"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Próximo banner"
              onClick={() => goTo(index + 1)}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55 active:scale-90"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Indicadores */}
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {banners.map((b, i) => (
                <button
                  key={b.src}
                  type="button"
                  aria-label={`Ir para banner ${i + 1}`}
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-5 bg-secondary' : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
