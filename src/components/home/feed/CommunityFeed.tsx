'use client'

/**
 * CommunityFeed — seção da home (após o ranking). Composer + lista de posts.
 * Recebe os posts já resolvidos do server; após publicar/excluir, faz
 * router.refresh() para re-buscar o feed atualizado.
 */

import { useRouter } from 'next/navigation'
import { Users2 } from 'lucide-react'
import { PostComposer } from './PostComposer'
import { PostCard } from './PostCard'
import type { FeedPost } from './types'

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

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Users2 className="h-4 w-4 text-secondary" />
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-white/70">
          Comunidade
        </h2>
      </div>

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
            <PostCard
              key={post.id}
              post={post}
              canDelete={isAdmin || post.author_id === currentUserId}
              onDeleted={refresh}
            />
          ))}
        </div>
      )}
    </section>
  )
}
