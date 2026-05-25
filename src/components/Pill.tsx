"use client";

interface Props {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function Pill({ label, active = false, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-pill shrink-0 px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 ${
        active
          ? "bg-secondary text-primary shadow-[var(--shadow-neon)]"
          : "glass text-white/75 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
