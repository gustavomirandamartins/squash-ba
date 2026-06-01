import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import path from "path";

// ── Gera (ou lê) src/data/changelog.json ─────────────────────────────────────
// Na Vercel o clone é shallow — o script gen-changelog.mjs roda como prebuild
// localmente e commita o changelog.json. Aqui lemos o arquivo já existente
// (gerado localmente e commitado) e só tentamos regenerar via git se disponível.
const changelogPath = path.join(__dirname, "src", "data", "changelog.json");

let commitCount = "0";
try {
  // Tenta git (funciona localmente; na Vercel pode retornar contagem parcial)
  const gitCount = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
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

  // Se o arquivo já commitado tem contagem maior (Vercel shallow), preserva-o
  let finalCount = parseInt(gitCount, 10);
  if (existsSync(changelogPath)) {
    const existing = JSON.parse(readFileSync(changelogPath, "utf8")) as { count: number };
    if (existing.count > finalCount) {
      finalCount = existing.count;
      // Mantém o arquivo existente — mais completo
      commitCount = String(finalCount);
    } else {
      // Arquivo local é mais recente, regrava
      const dataDir = path.join(__dirname, "src", "data");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(changelogPath, JSON.stringify({ count: finalCount, commits }, null, 2));
      commitCount = gitCount;
    }
  } else {
    const dataDir = path.join(__dirname, "src", "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(changelogPath, JSON.stringify({ count: finalCount, commits }, null, 2));
    commitCount = gitCount;
  }
} catch {
  // git indisponível — lê do arquivo commitado
  if (existsSync(changelogPath)) {
    const existing = JSON.parse(readFileSync(changelogPath, "utf8")) as { count: number };
    commitCount = String(existing.count);
  }
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
