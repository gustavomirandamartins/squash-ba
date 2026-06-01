import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

// ── Gera src/data/changelog.json a cada build/dev ────────────────────────────
// Git está disponível tanto em dev local quanto no runner do Vercel (build time).
// A página /versao importa esse JSON estático — não depende de git em runtime.
let commitCount = "0";
try {
  commitCount = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
  const rawLog = execSync("git log --no-merges --pretty=format:%H%x09%s%x09%as", {
    encoding: "utf8",
  }).trim();
  const commits = rawLog.split("\n").map((line) => {
    const parts = line.split("\t");
    return {
      hash: parts[0].slice(0, 7),
      subject: (parts[1] ?? "").trim(),
      date: parts[2] ?? "",
    };
  });
  const dataDir = path.join(__dirname, "src", "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    path.join(dataDir, "changelog.json"),
    JSON.stringify({ count: parseInt(commitCount, 10), commits }, null, 2),
  );
} catch {
  // git indisponível (não deve acontecer em build, mas não bloqueia)
}

// Hostname do Supabase (ex.: rghlwuucqkvyzyycewje.supabase.co) para liberar
// os avatares do Storage no next/image. Derivado da env var, sem hardcode.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_COUNT: commitCount,
  },
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

export default withSerwist(nextConfig);
