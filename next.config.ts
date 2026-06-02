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

// Versão exibida no app: timestamp do último commit (AAAAMMDDhhmm).
// O script gen-changelog.mjs gera o campo localmente e commita o arquivo;
// aqui só lemos — na Vercel (shallow clone) o arquivo commitado é a fonte de verdade.
let appVersion = "?";
try {
  // Tenta git (funciona localmente; na Vercel pode retornar dados parciais)
  const gitCount = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
  const lastCommitAt = execSync("git log -1 --format=%cd --date=format:%Y%m%d%H%M", {
    encoding: "utf8",
  }).trim();
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
  type ChangelogFile = { count: number; lastCommitAt?: string; commits: typeof commits };
  if (existsSync(changelogPath)) {
    const existing = JSON.parse(readFileSync(changelogPath, "utf8")) as ChangelogFile;
    if (existing.count > finalCount) {
      // Arquivo commitado é mais completo (Vercel shallow) — usa-o
      appVersion = existing.lastCommitAt ?? lastCommitAt;
    } else {
      // Arquivo local está atualizado — regrava com o novo campo
      const dataDir = path.join(__dirname, "src", "data");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(changelogPath, JSON.stringify({ count: finalCount, lastCommitAt, commits }, null, 2));
      appVersion = lastCommitAt;
    }
  } else {
    const dataDir = path.join(__dirname, "src", "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(changelogPath, JSON.stringify({ count: finalCount, lastCommitAt, commits }, null, 2));
    appVersion = lastCommitAt;
  }
} catch {
  // git indisponível — lê do arquivo commitado
  if (existsSync(changelogPath)) {
    type ChangelogFile = { count: number; lastCommitAt?: string };
    const existing = JSON.parse(readFileSync(changelogPath, "utf8")) as ChangelogFile;
    appVersion = existing.lastCommitAt ?? "?";
  }
}

// Hostname do Supabase (ex.: rghlwuucqkvyzyycewje.supabase.co) para liberar
// os avatares do Storage no next/image. Derivado da env var, sem hardcode.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERSION: appVersion,
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
