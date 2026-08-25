import { NextResponse } from "next/server";

import { API_BASE_URL } from "@/lib/api/config";
import { parseErrorDetail } from "@/lib/api/errors";
import { setRefreshCookie } from "@/lib/session";
import type { LoginResult, UserOut } from "@/lib/api/types";

/** Forme renvoyée au client par nos Route Handlers d'authentification : jamais le
 * refresh token, qui reste uniquement dans le cookie httpOnly (voir src/lib/session.ts). */
export interface ClientAuthResult {
  access_token: string;
  user: UserOut;
  is_new_user: boolean;
}

/** `POST /auth/login` seul peut renvoyer ceci (compte protégé par la 2FA) — voir
 * `LoginResult` dans lib/api/types.ts. Pas encore consommé par l'écran de
 * connexion (2FA pas encore câblée côté interface) : ce cas n'est atteint par
 * aucun compte existant aujourd'hui, mais `callBackendAuth` doit rester correct
 * dès maintenant plutôt que de planter sur `tokens: null` le jour où un compte
 * l'active. */
export interface ClientTwoFactorChallenge {
  requires_2fa: true;
  challenge_token: string;
}

/**
 * Appelle un endpoint d'émission de jetons du backend (signup / login / google),
 * pose le cookie httpOnly avec le refresh token, et ne renvoie au client que
 * l'access token en mémoire. Centralise la gestion d'échec honnête : un backend
 * injoignable renvoie 503 avec un message explicite, jamais un faux succès.
 */
export async function callBackendAuth(path: string, body: unknown): Promise<NextResponse> {
  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Le serveur Registre est injoignable. Réessayez dans un instant." },
      { status: 503 },
    );
  }

  if (!backendResponse.ok) {
    const message = await parseErrorDetail(backendResponse);
    return NextResponse.json({ error: message }, { status: backendResponse.status });
  }

  const data = (await backendResponse.json()) as LoginResult;

  if (data.requires_2fa) {
    // Compte protégé par la 2FA : pas de jetons à poser, juste le challenge.
    // L'écran de connexion ne sait pas encore l'utiliser (voir ClientTwoFactorChallenge
    // ci-dessus) ; on renvoie tout de même une 401 explicite plutôt que de planter
    // sur `tokens: null`, pour ne pas casser silencieusement les comptes avec 2FA.
    return NextResponse.json(
      { error: "La double authentification n'est pas encore prise en charge sur cet écran." },
      { status: 401 },
    );
  }

  await setRefreshCookie(data.tokens!.refresh_token);

  const result: ClientAuthResult = {
    access_token: data.tokens!.access_token,
    user: data.user!,
    is_new_user: data.is_new_user,
  };
  return NextResponse.json(result);
}
