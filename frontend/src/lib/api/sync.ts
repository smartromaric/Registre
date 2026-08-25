import { apiRequest } from "./http";
import type { RecordFieldConflictListOut, RecordFieldConflictOut } from "./types";

/**
 * Client du journal de conflits de synchronisation (cahier des charges §11.3,
 * PRODUCT.md §10.11). Même pattern que `records.ts` : `accessToken` en premier
 * paramètre. Réservé à l'ADMIN côté backend (`require_role(OrgRole.ADMIN)`) —
 * un appel par un autre rôle renvoie un 403, voir `app/(app)/organisation/conflits/page.tsx`
 * pour le gate côté écran.
 */

const base = (organizationId: string) => `/organizations/${organizationId}/sync/conflicts`;

export interface ListConflictsParams {
  onlyUnreviewed?: boolean;
  limit?: number;
  offset?: number;
}

export function listConflicts(
  accessToken: string,
  organizationId: string,
  params: ListConflictsParams = {},
): Promise<RecordFieldConflictListOut> {
  const search = new URLSearchParams();
  if (params.onlyUnreviewed) search.set("only_unreviewed", "true");
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));
  return apiRequest<RecordFieldConflictListOut>(`${base(organizationId)}?${search.toString()}`, { accessToken });
}

export function acknowledgeConflict(
  accessToken: string,
  organizationId: string,
  conflictId: string,
): Promise<RecordFieldConflictOut> {
  return apiRequest<RecordFieldConflictOut>(`${base(organizationId)}/${conflictId}/ack`, {
    accessToken,
    method: "POST",
  });
}
