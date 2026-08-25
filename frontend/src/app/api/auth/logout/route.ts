import { NextResponse } from "next/server";

import { clearRefreshCookie } from "@/lib/session";

/**
 * Le backend est stateless (JWT signés, pas de table de sessions à révoquer) :
 * "se déconnecter" veut dire effacer le cookie httpOnly et laisser le client
 * oublier son access token en mémoire. Rien d'autre à appeler côté serveur.
 */
export async function POST() {
  await clearRefreshCookie();
  return NextResponse.json({ ok: true });
}
