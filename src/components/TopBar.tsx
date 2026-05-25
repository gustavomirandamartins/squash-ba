import { Search } from "lucide-react";
import { Logo } from "./Logo";
import { SquashImage } from "./SquashImage";
import { currentUser } from "@/lib/mock/data";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <Logo />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Buscar"
          className="grid h-10 w-10 place-items-center rounded-full glass text-white/85 transition active:scale-95"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Perfil"
          className="h-10 w-10 overflow-hidden rounded-full border border-white/15 transition active:scale-95"
        >
          <SquashImage seed={currentUser.seed} rounded className="h-full w-full" />
        </button>
      </div>
    </header>
  );
}
