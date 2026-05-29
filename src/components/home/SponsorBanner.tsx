import Image from 'next/image'
import { Megaphone } from 'lucide-react'

interface Props {
  src: string | null
  href?: string | null
}

export function SponsorBanner({ src, href }: Props) {
  const banner = src ? (
    <div className="relative aspect-[16/6] w-full overflow-hidden rounded-3xl">
      <Image src={src} alt="Patrocinador" fill sizes="480px" className="object-cover" />
    </div>
  ) : (
    <div className="flex aspect-[16/6] w-full items-center justify-center rounded-3xl bg-gradient-to-br from-secondary/15 via-white/[0.04] to-transparent ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-white/40">
        <Megaphone className="h-4 w-4" />
        <span className="text-xs font-medium">Espaço do patrocinador</span>
      </div>
    </div>
  )

  return (
    <div className="px-5">
      {src && href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block transition active:scale-[0.99]">
          {banner}
        </a>
      ) : (
        banner
      )}
    </div>
  )
}
