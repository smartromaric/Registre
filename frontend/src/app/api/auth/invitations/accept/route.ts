import type { NextRequest } from "next/server";

import { callBackendAuth } from "../../_lib/forward";
import type { InvitationAcceptRequest } from "@/lib/api/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as InvitationAcceptRequest;
  return callBackendAuth("/auth/invitations/accept", body);
}
