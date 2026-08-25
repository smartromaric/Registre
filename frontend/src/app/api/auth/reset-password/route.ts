import type { NextRequest } from "next/server";

import { callBackendAuth } from "../_lib/forward";
import type { ResetPasswordRequest } from "@/lib/api/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ResetPasswordRequest;
  return callBackendAuth("/auth/password/reset", body);
}
