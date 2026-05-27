import Image from "next/image";

interface Props {
  className?: string;
  showWordmark?: boolean;
  size?: number;
}

export function Logo({ className = "", showWordmark = true, size = 40 }: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/brand/logo.png"
        alt="SquashBa"
        width={size}
        height={size}
        priority
        className="shrink-0 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
      />
      {showWordmark && (
        <span className="font-display text-lg font-extrabold tracking-tight">
          Squash<span className="text-secondary">Ba</span>
        </span>
      )}
    </div>
  );
}
