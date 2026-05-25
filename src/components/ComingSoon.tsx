import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon, title, description }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center reveal">
      <div className="grid h-20 w-20 place-items-center rounded-3xl glass">
        <Icon className="h-9 w-9 text-secondary" strokeWidth={1.8} />
      </div>
      <h1 className="mt-6 font-display text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/60 text-balance">
        {description}
      </p>
      <span className="glass-pill glass mt-6 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
        Em construção
      </span>
    </div>
  );
}
