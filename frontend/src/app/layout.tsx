import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Police de lecture courante : lisible, neutre, très bonne couverture des accents
// français aux petites tailles (tableaux, formulaires — cahier des charges §14.7).
const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Police d'accent pour les titres et les moments de marque (écrans d'auth,
// en-têtes de section) : plus de caractère, sans sacrifier la lisibilité.
const fontHeading = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

// Réservée aux valeurs tabulaires (codes, montants alignés) — pas encore utilisée
// dans ce lot, posée dès maintenant pour les écrans de fiches/stock à venir.
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
    { media: "(prefers-color-scheme: light)", color: "#fbfaff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f1a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontHeading.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
