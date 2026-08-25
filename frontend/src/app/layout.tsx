import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Une seule famille pour tout le texte courant et les titres (§ refonte visuelle
// 2026-08-25 — direction "premium sobre" façon Linear/Vercel) : Geist a une
// excellente couverture des accents français, et son poids monte jusqu'à 900,
// assez pour donner du caractère aux titres (tracking resserré, voir
// globals.css) sans jamais changer de famille — c'est cette cohérence qui lit
// "outil d'ingénieur soigné" plutôt que "site vitrine avec une police d'accent".
const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Valeurs tabulaires (codes, montants alignés, IDs) — chiffres à chasse fixe.
const fontMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Registre",
    template: "%s · Registre",
  },
  description:
    "Registre — le socle unique pour suivre vos actifs et vos stocks : véhicules, gaz, vêtements, personnel et plus, sans tableur ni classeur.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#100d0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
