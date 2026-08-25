/**
 * URL de base de l'API FastAPI (préfixe /api/v1 inclus). Une seule variable
 * d'environnement, lue aussi bien côté serveur (route handlers) que côté
 * navigateur : en développement, un seul backend est joignable des deux côtés
 * à la même adresse. Documenté dans frontend/README.md.
 */
function resolveApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export const API_ORIGIN = resolveApiBaseUrl();
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
