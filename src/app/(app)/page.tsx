import { FilterPills } from "@/components/FilterPills";
import { StoriesRow } from "@/components/StoriesRow";
import { MatchHeroCard } from "@/components/MatchHeroCard";
import { FeedCard } from "@/components/FeedCard";
import { heroMatch, feed } from "@/lib/mock/data";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="reveal" style={{ animationDelay: "40ms" }}>
        <FilterPills />
      </div>

      <div className="reveal" style={{ animationDelay: "120ms" }}>
        <StoriesRow />
      </div>

      <section className="reveal" style={{ animationDelay: "200ms" }}>
        <div className="mb-3 flex items-center justify-between px-5">
          <h2 className="font-display text-lg font-bold">Partida em destaque</h2>
          <button type="button" className="text-xs font-semibold text-secondary">
            Ver agenda
          </button>
        </div>
        <MatchHeroCard match={heroMatch} />
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="px-5 font-display text-lg font-bold reveal" style={{ animationDelay: "280ms" }}>
          Da comunidade
        </h2>
        {feed.map((item, i) => (
          <div
            key={item.id}
            className="reveal"
            style={{ animationDelay: `${320 + i * 80}ms` }}
          >
            <FeedCard item={item} />
          </div>
        ))}
      </section>
    </div>
  );
}
