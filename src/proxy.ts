// Next.js 16: middleware renomeado para proxy.ts — export nomeado "proxy" (ou default).
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|brand|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
}
