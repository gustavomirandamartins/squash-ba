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
    statusBarStyle: "black-translucent",
    title: "SquashBa",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d2b45",
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

          --top-inset: recuo superior dos headers. No web app instalado no iOS
          (26+), o sistema aplica um desfoque automático sob a status bar que
          avança ~3rem sobre o conteúdo e não pode ser desligado por CSS — então
          o header desce além da safe area. Só iOS (-webkit-touch-callout) em
          modo standalone; demais plataformas usam a safe area pura.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              ".glass-overlay{-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%)}" +
              ":root{--top-inset:env(safe-area-inset-top,0px)}" +
              "@supports (-webkit-touch-callout:none){@media (display-mode:standalone){:root{--top-inset:calc(env(safe-area-inset-top,0px) + 3.5rem)}}}",
          }}
        />
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
}
