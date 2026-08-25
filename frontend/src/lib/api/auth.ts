import { apiRequest } from "./http";
import { ApiError } from "./errors";
import type {
  ForgotPasswordRequest,
  GoogleAuthRequest,
  InvitationAcceptRequest,
  InvitationInfoOut,
  LoginRequest,
  ResetPasswordRequest,
  SignupRequest,
  UserOut,
} from "./types";

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

// --- mot de passe oublié (§4.4 raffinement) ---------------------------------------------

/** Toujours un succès côté appelant (le backend renvoie 204 qu'un compte existe
 * ou non pour cet e-mail — voir `AuthService.request_password_reset`) : ne
 * jamais afficher "aucun compte trouvé", ce serait énumérer les comptes. Appel
 * direct au backend (endpoint public, pas de jeton à poser) — pas de Route
 * Handler dédié puisqu'aucun jeton n'est renvoyé ici. */
export function forgotPassword(email: string): Promise<void> {
  return apiRequest<void>("/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email } satisfies ForgotPasswordRequest),
  });
}

/** Réinitialise le mot de passe et connecte immédiatement — même forme de
 * réponse (`AuthResponse`) que login/signup, donc même chemin de stockage des
 * jetons via `/api/auth/reset-password` (cookie httpOnly posé côté serveur). */
export function resetPassword(payload: ResetPasswordRequest): Promise<ClientAuthResult> {
  return postToOwnRoute("/api/auth/reset-password", payload);
}

// --- acceptation d'invitation par e-mail (§4.4) -----------------------------------------

/** Endpoint public (le jeton d'invitation signé fait foi) — appel direct au
 * backend, pas de jeton de session en jeu ici. 400 si le jeton est invalide ou
 * expiré (`ApiError.status === 400`). */
export function getInvitation(token: string): Promise<InvitationInfoOut> {
  return apiRequest<InvitationInfoOut>(`/auth/invitations/${encodeURIComponent(token)}`);
}

/** Accepte l'invitation et connecte immédiatement — même mécanisme que
 * `resetPassword` (Route Handler dédié, cookie httpOnly). */
export function acceptInvitation(payload: InvitationAcceptRequest): Promise<ClientAuthResult> {
  return postToOwnRoute("/api/auth/invitations/accept", payload);
}
