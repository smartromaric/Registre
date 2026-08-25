import { API_BASE_URL } from "./config";
import { ApiError, parseErrorDetail } from "./errors";

export interface ApiRequestInit extends Omit<RequestInit, "headers"> {
  accessToken?: string;
  headers?: Record<string, string>;
}

/**
 * Appel direct au backend FastAPI depuis le navigateur, avec le access token en
 * mémoire (jamais un cookie ni un stockage persistant côté client — voir
 * src/lib/session.ts pour la stratégie complète). Réservé aux routes déjà
 * protégées par `get_current_user` / `get_org_context` côté backend
 * (`/auth/me`, `/organizations`, `/auth/organizations`...).
 */
export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { accessToken, headers, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(
      "Impossible de joindre le serveur Registre. Vérifiez votre connexion.",
      0,
      "network",
    );
  }

  if (!response.ok) {
    const message = await parseErrorDetail(response);
    throw new ApiError(message, response.status, "http");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
