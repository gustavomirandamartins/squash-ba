import type { Seed } from "@/lib/mock/types";

/**
 * Placeholder visual gerado localmente (sem fetch externo).
 * Cada seed produz um gradiente azul-marinho distinto com um
 * motivo sutil de quadra de squash + traço neon.
 */
const palettes: Record<Seed, [string, string, string]> = {
  salvador: ["#21304e", "#16233a", "#0e1626"],
  barra: ["#26324f", "#1a2740", "#10192b"],
  pituba: ["#1d3350", "#152a45", "#0d1a2c"],
  ondina: ["#2a3458", "#1c2748", "#111a30"],
  "rio-vermelho": ["#2c2f4e", "#1d2340", "#12172b"],
  itapua: ["#1f3552", "#142c47", "#0c1c30"],
  stiep: ["#243150", "#182841", "#0e1a2c"],
  graca: ["#283454", "#1b2745", "#101a2e"],
};

interface Props {
  seed: Seed;
  className?: string;
  /** mostra o motivo da quadra (para cards grandes) */
  court?: boolean;
  rounded?: boolean;
  children?: React.ReactNode;
}

export function SquashImage({
  seed,
  className = "",
  court = false,
  rounded = false,
  children,
}: Props) {
  const [a, b, c] = palettes[seed];
  const uid = `sq-${seed}`;

  return (
    <div
      className={`relative overflow-hidden ${rounded ? "rounded-[inherit]" : ""} ${className}`}
      style={{
        background: `radial-gradient(120% 110% at 25% 0%, ${a} 0%, ${b} 45%, ${c} 100%)`,
      }}
      aria-hidden
    >
      {/* brilho neon de canto */}
      <div
        className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
        style={{ background: "rgba(205,253,81,0.16)" }}
      />
      {court && (
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.18]"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* linhas de quadra de squash */}
          <g
            fill="none"
            stroke="#cdfd51"
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <rect x="40" y="30" width="320" height="240" rx="6" />
            <line x1="40" y1="180" x2="360" y2="180" />
            <line x1="200" y1="180" x2="200" y2="270" />
            <rect x="40" y="180" width="80" height="90" />
            <rect x="280" y="180" width="80" height="90" />
            <path d="M40 110 L360 110" strokeDasharray="6 10" opacity="0.6" />
          </g>
        </svg>
      )}
      {/* raquete + bola estilizadas */}
      <svg
        className="absolute bottom-3 right-3 h-10 w-10 opacity-25"
        viewBox="0 0 48 48"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.4"
      >
        <ellipse cx="18" cy="16" rx="11" ry="13" />
        <line x1="18" y1="29" x2="18" y2="44" />
        <circle cx="36" cy="34" r="5" fill="#cdfd51" stroke="none" />
      </svg>
      <span className="sr-only">{uid}</span>
      {children}
    </div>
  );
}
