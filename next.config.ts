import type { NextConfig } from "next";

// Hostname do Supabase (ex.: rghlwuucqkvyzyycewje.supabase.co) para liberar
// os avatares do Storage no next/image. Derivado da env var, sem hardcode.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Fixa a raiz do projeto: há um package-lock.json solto em ~/ que confundia o
  // Turbopack (inferia a raiz errada). Evita recompilações/watch fora do projeto.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
