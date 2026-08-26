import type { NextConfig } from "next";

/**
 * Export statique : le site vitrine est servi comme des fichiers plats.
 * C'est ce qui lui permet de ne jamais s'endormir sur un hébergement gratuit —
 * contrairement à l'application, qui se met en veille au bout de 15 minutes.
 * Conséquence assumée : aucune route API ici. Le seul formulaire du site renvoie
 * vers l'application ou vers un e-mail direct, jamais vers un faux accusé d'envoi
 * (playbook §3, « les états d'échec sont honnêtes »).
 */

/**
 * Préfixe d'URL, quand le site ne vit pas à la racine d'un domaine.
 *
 * Nécessaire dès qu'il faut cohabiter avec une application déjà en place sur le
 * même nom : `uat.upjunoo.com/vitrine`, par exemple. Sans lui, les fichiers
 * exportés référencent `/_next/static/…` en absolu, et rien ne se charge.
 *
 * Next impose un préfixe commençant par « / » et sans « / » final ; la valeur
 * est donc normalisée ici plutôt que laissée à la vigilance de celui qui écrit
 * le `.env` — une barre en trop produit un build qui réussit et un site blanc.
 */
function normalizeBasePath(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || trimmed === "/") return undefined;
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

/**
 * Origines autorisees a joindre le serveur de developpement.
 *
 * Meme piege que pour l'application : depuis Next 15, `next dev` protege
 * `/_next/*` par une verification d'origine. Servi derriere un tunnel, il rend
 * le HTML et refuse ses propres chunks en 403 — la page s'affiche, l'animation
 * ne demarre jamais, et rien dans la console ne pointe vers l'origine.
 * Sans effet en production, ou le site est un export statique.
 */
const devOrigins = (process.env.NEXT_PUBLIC_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
