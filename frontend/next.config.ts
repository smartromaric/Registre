import type { NextConfig } from "next";

/**
 * Origines autorisées à joindre le serveur de développement.
 *
 * PIÈGE COÛTEUX. Depuis Next 15, le serveur de dev protège `/_next/*` par une
 * vérification d'origine. Servi derrière un tunnel (Cloudflare, ngrok…) ou
 * simplement appelé sur `127.0.0.1` plutôt que `localhost`, il rend le HTML
 * normalement mais renvoie **403 sur tous ses chunks JavaScript** : la page
 * s'affiche, rien ne s'hydrate, aucun bouton ne réagit — et la console ne
 * montre que des erreurs de chargement sans rapport apparent avec l'origine.
 *
 * `NEXT_PUBLIC_DEV_ORIGINS` accepte une liste séparée par des virgules. Elle
 * n'a d'effet qu'en développement ; en production, le serveur ne fait pas cette
 * vérification (c'est le rôle du reverse proxy).
 */
const devOrigins = (process.env.NEXT_PUBLIC_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  // `allowedDevOrigins` attend des HÔTES, pas des URL : un schéma laissé en
  // place fait échouer la comparaison en silence.
  .map((origin) => origin.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
