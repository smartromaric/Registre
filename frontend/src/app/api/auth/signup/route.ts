import type { NextRequest } from "next/server";

import { callBackendAuth } from "../_lib/forward";
import type { SignupRequest } from "@/lib/api/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as SignupRequest;
  return callBackendAuth("/auth/signup", body);
}
