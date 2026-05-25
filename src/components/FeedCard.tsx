import { Heart, MessageCircle, Bookmark, Share2 } from "lucide-react";
import { SquashImage } from "./SquashImage";
import type { FeedItem } from "@/lib/mock/types";

const kindLabel: Record<FeedItem["kind"], string> = {
  noticia: "Notícia",
  destaque: "Destaque",
  resultado: "Resultado",
};

export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <article className="glass glass-card mx-5 overflow-hidden">
      <div className="relative h-44">
        <SquashImage seed={item.seed} court className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-700/85 via-primary/20 to-transparent" />
        <span className="glass-pill absolute left-3 top-3 bg-secondary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
          {kindLabel[item.kind]}
        </span>
        <h3 className="absolute bottom-3 left-4 right-4 font-display text-lg font-bold leading-snug text-balance">
          {item.title}
        </h3>
      </div>

      <div className="px-4 py-4">
        <p className="text-sm leading-relaxed text-white/70">{item.excerpt}</p>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-white/45">
            {item.author} · {item.timeAgo}
          </p>
          <div className="flex items-center gap-3.5 text-white/70">
            <span className="flex items-center gap-1 text-xs">
              <Heart className="h-4 w-4" /> {item.likes}
            </span>
            <span className="flex items-center gap-1 text-xs">
              <MessageCircle className="h-4 w-4" /> {item.comments}
            </span>
            <Bookmark className="h-4 w-4" />
            <Share2 className="h-4 w-4" />
          </div>
        </div>
      </div>
    </article>
  );
}
