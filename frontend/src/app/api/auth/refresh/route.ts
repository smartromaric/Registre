import { NextResponse } from "next/server";

import { API_BASE_URL } from "@/lib/api/config";
import { parseErrorDetail } from "@/lib/api/errors";
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from "@/lib/session";
import type { TokenPairOut } from "@/lib/api/types";

/**
 * Reconstruit un access token à partir du refresh token httpOnly. Appelé au
 * chargement de l'application (AuthProvider) pour retrouver une session sans
 * jamais avoir stocké l'access token lui-même côté client entre deux visites.
 */
export async function POST() {
  const refreshToken = await getRefreshCookie();
  if (!refreshToken) {
    return NextResponse.json({ error: "Aucune session active." }, { status: 401 });
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Le serveur Registre est injoignable. Réessayez dans un instant." },
      { status: 503 },
    );
  }

  if (!backendResponse.ok) {
    // Refresh token expiré/invalide : on efface le cookie plutôt que de le garder
    // en place indéfiniment (état honnête, pas de session fantôme).
    await clearRefreshCookie();
    const message = await parseErrorDetail(backendResponse);
    return NextResponse.json({ error: message }, { status: backendResponse.status });
  }

  const tokens = (await backendResponse.json()) as TokenPairOut;
  await setRefreshCookie(tokens.refresh_token);
  return NextResponse.json({ access_token: tokens.access_token });
}
