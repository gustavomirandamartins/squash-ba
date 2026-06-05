export type FeedPost = {
  id: string
  author_id: string
  body: string | null
  image_path: string | null
  image_url: string | null
  embed_url: string | null
  embed_provider: 'youtube' | 'instagram' | 'link' | null
  created_at: string
  author_name: string | null
  author_avatar: string | null
  like_count: number
  comment_count: number
  liked: boolean
}

export type FeedComment = {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
  author_name: string | null
  author_avatar: string | null
}

export type CurrentUser = {
  id: string
  name: string | null
  avatar: string | null
  isAdmin: boolean
}
