'use client'

// Guarda o perfil exibido na moldura para o shell offline (shell-profile).

import { useEffect } from 'react'
import type { FrameProfile } from '@/components/AppFrame'
import { saveShellProfile } from '@/lib/offline/shell-profile'

export function ShellProfileSaver({ profile }: { profile: FrameProfile }) {
  const { userId, name, avatarUrl, isAdmin, canManage } = profile
  useEffect(() => {
    saveShellProfile({ userId, name, avatarUrl, isAdmin, canManage })
  }, [userId, name, avatarUrl, isAdmin, canManage])
  return null
}
