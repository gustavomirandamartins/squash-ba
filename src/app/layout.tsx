import type { Metadata, Viewport } from "next";
import { Sora, Inter } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "SquashBa",
  title: {
    default: "SquashBa — A comunidade do Squash baiano",
    template: "%s · SquashBa",
  },
  description:
    "A rede social do Squash da Bahia: jogos, campeonatos, jogadores e a comunidade, tudo em um só lugar.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // Status bar SÓLIDA (cor = theme-color): o conteúdo começa abaixo dela.
    // Com "black-translucent" o app desenhava sob o relógio e o desfoque
    // automático do iOS 26+ invadia o header. Mudança só vale após reinstalar
    // o web app na tela de início (o iOS grava o estilo na instalação).
    statusBarStyle: "default",
    title: "SquashBa",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  // = cor do header (e do <html> em globals.css), para a status bar casar com ele.
  themeColor: "#2c364b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/*
          backdrop-filter injetado como CSS cru: o Lightning CSS do Tailwind v4
          descarta a propriedade quando ela vem do globals.css compilado. Este
          <style> é HTML em runtime e não passa pelo compilador.

          O blur SÓ é aplicado em .glass-overlay — elementos que de fato se
          sobrepõem a conteúdo que rola por baixo (ex.: menu inferior). O .glass
          comum fica sobre o gradiente liso do body, onde borrar não muda nada
          visualmente e só custa paint a cada frame — por isso não leva blur.

          --top-inset: recuo superior dos headers (safe area do topo). Fica
          centralizado aqui para ajustar todos os headers num ponto só.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              ".glass-overlay{-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%)}" +
              ":root{--top-inset:env(safe-area-inset-top,0px)}",
          }}
        />
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
}
