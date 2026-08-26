/**
 * Où pointent les appels à l'action.
 *
 * Le site vitrine et l'application sont deux déploiements distincts (voir
 * `next.config.ts`) : l'adresse de l'application est donc une variable, figée au
 * moment de la construction. En développement, elle vaut le port de l'app locale.
 *
 * Si la variable est absente en production, on préfère un lien vers l'accueil de
 * l'app plutôt qu'un lien mort : un bouton « Commencer » qui ne mène nulle part
 * est pire qu'un bouton qui mène à la page de connexion.
 */
const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/+$/, "");

export function appUrl(path: string): string {
  return `${APP_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
