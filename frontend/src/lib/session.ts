import "server-only";
import { cookies } from "next/headers";

/**
 * Stratégie de gestion des jetons (documentée dans frontend/README.md) :
 *
 * - Le refresh token (longue durée, 30 jours côté backend — voir
 *   `backend/app/core/config.py:refresh_token_expire_days`) vit UNIQUEMENT dans un
 *   cookie httpOnly posé par nos propres Route Handlers (`src/app/api/auth/*`).
 *   Il n'est jamais lisible par le JavaScript client : une faille XSS ne peut pas
 *   l'exfiltrer.
 * - Le access token (courte durée, 24 h) n'est JAMAIS persisté (ni cookie, ni
 *   localStorage) : il vit en mémoire côté client (`AuthProvider`, voir
 *   src/lib/auth/auth-context.tsx) et est reconstruit au chargement de l'app en
 *   appelant POST /api/auth/refresh, qui lit ce cookie httpOnly côté serveur.
 * - Toutes les routes /api/auth/* de ce dossier sont les seules à voir le cookie ;
 *   le reste de l'application appelle directement le backend FastAPI avec
 *   `Authorization: Bearer <access_token>` en mémoire.
 */
const REFRESH_COOKIE_NAME = "registre_rt";
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 jours, aligné sur le backend

export async function setRefreshCookie(refreshToken: string): Promise<void> {
  const store = await cookies();
  store.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function getRefreshCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE_NAME)?.value;
}

export async function clearRefreshCookie(): Promise<void> {
  const store = await cookies();
  store.delete({ name: REFRESH_COOKIE_NAME, path: "/api/auth" });
}
