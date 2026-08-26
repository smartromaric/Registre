import type { NextConfig } from "next";

/**
 * Export statique : le site vitrine est servi comme des fichiers plats.
 * C'est ce qui lui permet, sur l'offre gratuite Render, de ne jamais s'endormir —
 * contrairement à l'application, qui se met en veille au bout de 15 minutes.
 * Conséquence assumée : aucune route API ici. Le seul formulaire du site renvoie
 * vers l'application ou vers un e-mail direct, jamais vers un faux accusé d'envoi
 * (playbook §3, « les états d'échec sont honnêtes »).
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
