'use client'

/**
 * CommunityFeed — seção da home (após o ranking). Composer + lista de posts.
 * Recebe os posts já resolvidos do server; após publicar/excluir, faz
 * router.refresh() para re-buscar o feed atualizado. Curtidas/comentários são
 * otimistas no client e não exigem refresh.
 */

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Users2 } from 'lucide-react'
import { PostComposer } from './PostComposer'
import { PostCard } from './PostCard'
import type { CurrentUser, FeedPost } from './types'

export function CommunityFeed({
  posts,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  isAdmin,
}: {
  posts: FeedPost[]
  currentUserId: string
  currentUserName: string | null
  currentUserAvatar: string | null
  isAdmin: boolean
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  const me: CurrentUser = useMemo(
    () => ({ id: currentUserId, name: currentUserName, avatar: currentUserAvatar, isAdmin }),
    [currentUserId, currentUserName, currentUserAvatar, isAdmin],
  )

  return (
    <section className="px-5 space-y-3">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
        <Users2 className="h-5 w-5 text-secondary" />
        Comunidade
      </h2>

      <PostComposer
        userId={currentUserId}
        userName={currentUserName}
        userAvatar={currentUserAvatar}
        onPosted={refresh}
      />

      {posts.length === 0 ? (
        <div className="glass glass-card px-4 py-8 text-center text-sm text-white/35">
          Ainda não há publicações. Seja o primeiro a compartilhar algo!
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} me={me} onDeleted={refresh} />
          ))}
        </div>
      )}
    </section>
  )
}
