import { apiRequest } from "./http";
import { ApiError } from "./errors";
import type { GoogleAuthRequest, LoginRequest, SignupRequest, UserOut } from "./types";

/** Réponse renvoyée par nos propres Route Handlers /api/auth/* (jamais le refresh token). */
export interface ClientAuthResult {
  access_token: string;
  user: UserOut;
  is_new_user: boolean;
}

async function postToOwnRoute(path: string, body: unknown): Promise<ClientAuthResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Impossible de contacter le serveur. Vérifiez votre connexion.", 0, "network");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Erreur ${response.status}.`;
    throw new ApiError(message, response.status, "http");
  }
  return data as ClientAuthResult;
}

export function signup(payload: SignupRequest): Promise<ClientAuthResult> {
  return postToOwnRoute("/api/auth/signup", payload);
}

export function login(payload: LoginRequest): Promise<ClientAuthResult> {
  return postToOwnRoute("/api/auth/login", payload);
}

export function loginWithGoogle(payload: GoogleAuthRequest): Promise<ClientAuthResult> {
  return postToOwnRoute("/api/auth/google", payload);
}

/** Retourne `null` (jamais une exception) quand il n'y a simplement pas de session
 * à reconstruire — c'est l'état normal d'un visiteur non connecté, pas une erreur. */
export async function refreshSession(): Promise<{ access_token: string } | null> {
  const response = await fetch("/api/auth/refresh", { method: "POST" });
  if (!response.ok) return null;
  return (await response.json()) as { access_token: string };
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export function fetchCurrentUser(accessToken: string): Promise<UserOut> {
  return apiRequest<UserOut>("/auth/me", { accessToken });
}
