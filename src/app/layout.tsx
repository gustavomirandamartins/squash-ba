import type { Metadata, Viewport } from "next";
import { Sora, Inter } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

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
          <style> é HTML em runtime e não passa pelo compilador, garantindo o
          vidro fosco (glassmorphism) em todos os .glass / .glass-strong.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              ".glass{-webkit-backdrop-filter:blur(24px) saturate(150%);backdrop-filter:blur(24px) saturate(150%)}" +
              ".glass-strong{-webkit-backdrop-filter:blur(28px) saturate(150%);backdrop-filter:blur(28px) saturate(150%)}",
          }}
        />
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
