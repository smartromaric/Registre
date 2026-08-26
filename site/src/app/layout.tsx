import type { Metadata, Viewport } from "next";
import { Geist, Space_Grotesk } from "next/font/google";

import { content } from "@/lib/content";
import { typo } from "@/lib/typography";

import "./globals.css";

/** Titres : une grotesque géométrique, plus caractérisée que le texte courant. */
const fontTitle = Space_Grotesk({
  variable: "--font-title",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

/** Texte courant : la même famille que l'application, pour la continuité de marque. */
const fontBody = Geist({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: typo(content.meta.title),
  description: typo(content.meta.description),
  openGraph: {
    title: typo(content.meta.title),
    description: typo(content.meta.description),
    type: "website",
    locale: "fr_FR",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1c1614" },
    { media: "(prefers-color-scheme: light)", color: "#fdfbfa" },
  ],
};

/**
 * Playbook §3 : le thème est posé **avant l'hydratation**, sinon la page s'affiche
 * une frame dans le mauvais thème (le « flash »). D'où le script inline et le
 * `suppressHydrationWarning` sur <html> — l'attribut posé par ce script diffère
 * forcément de ce que React a rendu côté serveur, et c'est voulu.
 *
 * Le site est sombre par défaut ; on ne suit `prefers-color-scheme` que si le
 * visiteur n'a jamais choisi.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("registre-site-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${fontTitle.variable} ${fontBody.variable} page-motif antialiased`}>{children}</body>
    </html>
  );
}
