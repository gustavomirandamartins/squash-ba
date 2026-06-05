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
}
