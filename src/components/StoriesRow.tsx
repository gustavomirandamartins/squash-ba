import { SquashImage } from "./SquashImage";
import { stories } from "@/lib/mock/data";

export function StoriesRow() {
  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-5">
      {stories.map((s) => (
        <div key={s.id} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <div className="relative">
            <div
              className={`grid h-16 w-16 place-items-center rounded-full p-[2.5px] ${
                s.live ? "ring-neon" : "bg-neutral"
              }`}
            >
              <SquashImage
                seed={s.seed}
                rounded
                className="h-full w-full rounded-full border-2 border-primary"
              />
            </div>
            {s.live && (
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-secondary px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary">
                ao vivo
              </span>
            )}
          </div>
          <span className="line-clamp-1 text-center text-[11px] text-white/70">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
