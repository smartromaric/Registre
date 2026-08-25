import type { NextRequest } from "next/server";

import { callBackendAuth } from "../_lib/forward";
import type { LoginRequest } from "@/lib/api/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LoginRequest;
  return callBackendAuth("/auth/login", body);
}
