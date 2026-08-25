import type { NextRequest } from "next/server";

import { callBackendAuth } from "../_lib/forward";
import type { GoogleAuthRequest } from "@/lib/api/types";

/**
 * Le backend vérifie le jeton Google (`GoogleNotConfiguredError` -> 503 si
 * `GOOGLE_CLIENT_ID` n'est pas configuré côté serveur — voir
 * backend/app/services/auth_service.py). On relaie tel quel : pas de simulation
 * de succès si Google n'est pas branché.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as GoogleAuthRequest;
  return callBackendAuth("/auth/google", body);
}
