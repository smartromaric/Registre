import { API_BASE_URL } from "./config";
import { ApiError, parseErrorBody } from "./errors";

export interface ApiRequestInit extends Omit<RequestInit, "headers"> {
  accessToken?: string;
  headers?: Record<string, string>;
}

/**
 * Appel direct au backend FastAPI depuis le navigateur, avec le access token en
 * mémoire (jamais un cookie ni un stockage persistant côté client — voir
 * src/lib/session.ts pour la stratégie complète). Réservé aux routes déjà
 * protégées par `get_current_user` / `get_org_context` côté backend
 * (`/auth/me`, `/organizations`, `/auth/organizations`, et tous les modules
 * métier ci-dessous — fiches, modèles, documents...).
 *
 * Quand `init.body` est un `FormData` (téléversement de document), le
 * `Content-Type: application/json` par défaut est omis pour laisser le
 * navigateur poser lui-même le `multipart/form-data; boundary=...` correct.
 * Même omission pour un `Blob` brut (morceau de téléversement repris, §11.3 —
 * voir `lib/offline/uploads.ts`) : le corps part tel quel, sans enveloppe JSON.
 */
export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { accessToken, headers, ...rest } = init;
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const isBinaryBody = typeof Blob !== "undefined" && rest.body instanceof Blob;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        ...(isFormData || isBinaryBody ? {} : { "Content-Type": "application/json" }),
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
    const parsed = await parseErrorBody(response);
    throw new ApiError(parsed.message, response.status, "http", parsed.fieldErrors);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
