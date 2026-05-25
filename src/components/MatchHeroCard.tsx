import { ChevronRight } from "lucide-react";
import { SquashImage } from "./SquashImage";
import type { Match } from "@/lib/mock/types";

export function MatchHeroCard({ match }: { match: Match }) {
  const live = match.status === "ao-vivo";
  return (
    <article className="glass-card relative mx-5 overflow-hidden rounded-[28px] border border-white/10 shadow-[var(--shadow-glass)]">
      <SquashImage seed={match.seed} court className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/30 to-primary-700/80" />

      <div className="relative flex flex-col">
        {/* topo: status + campeonato */}
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="glass-pill glass px-3 py-1 text-xs font-semibold text-white/85">
            {match.championship}
          </span>
          {live ? (
            <span className="glass-pill flex items-center gap-1.5 bg-secondary px-3 py-1 text-xs font-bold uppercase text-primary">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary" />
              ao vivo
            </span>
          ) : (
            <span className="glass-pill glass px-3 py-1 text-xs font-semibold text-white/85">
              {match.round}
            </span>
          )}
        </div>

        {/* confronto */}
        <div className="flex items-center justify-between gap-2 px-6 py-9">
          <PlayerSide name={match.home.name} club={match.home.club} align="left" />
          <span className="font-display text-3xl font-extrabold italic text-secondary drop-shadow">
            VS
          </span>
          <PlayerSide name={match.away.name} club={match.away.club} align="right" />
        </div>

        {/* strip de info em glass */}
        <div className="glass-strong m-3 mt-0 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-wide text-white/55">
              {match.round} · {match.court}
            </p>
            <p className="mt-0.5 font-display text-xl font-bold leading-none">
              {match.time}{" "}
              <span className="text-sm font-medium text-white/60">
                · {match.date}
              </span>
            </p>
          </div>
          <button
            type="button"
            className="glass-pill flex shrink-0 items-center gap-1 bg-secondary px-4 py-2 text-sm font-bold text-primary transition active:scale-95"
          >
            {live ? "Assistir" : "Ver jogo"}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function PlayerSide({
  name,
  club,
  align,
}: {
  name: string;
  club: string;
  align: "left" | "right";
}) {
  return (
    <div className={`flex-1 ${align === "right" ? "text-right" : "text-left"}`}>
      <p className="font-display text-lg font-bold leading-tight">{name}</p>
      <p className="mt-1 text-xs text-white/60">{club}</p>
    </div>
  );
}
