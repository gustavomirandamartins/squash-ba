"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Play, Users, type LucideIcon } from "lucide-react";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
}

const items: Item[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/campeonatos", label: "Campeonatos", icon: CalendarDays },
  { href: "/jogos", label: "Jogos", icon: Play },
  { href: "/comunidade", label: "Comunidade", icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto glass glass-pill flex items-center gap-1 px-2.5 py-2.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`grid h-12 w-12 place-items-center rounded-full transition-all duration-200 active:scale-90 ${
                active
                  ? "bg-secondary text-primary shadow-[var(--shadow-neon)]"
                  : "text-white/65 hover:text-white"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.6 : 2} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
