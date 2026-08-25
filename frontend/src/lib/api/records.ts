import { apiRequest } from "./http";
import type {
  RecordCreate,
  RecordEventCreate,
  RecordEventOut,
  RecordListOut,
  RecordOut,
  RecordUpdate,
  RecordUpdateOut,
} from "./types";

/**
 * Client des fiches (cahier des charges §6). Même pattern que `organizations.ts` :
 * `accessToken` en premier paramètre, `apiRequest` lève `ApiError` sur tout échec.
 *
 * Pagination : `listRecords` est **toujours** appelée avec `limit`/`offset` — jamais
 * de "charger tout puis paginer côté client". C'est ce qui permet à la vue liste de
 * rester rapide avec 10 000 fiches (cahier des charges §14.3). `RecordListOut.total`
 * porte le nombre réel de fiches côté serveur, utilisé pour calculer le nombre de pages.
 *
 * Tri et filtres par champ : le service backend (`RecordService.list_for_model`) sait
 * trier par `sort_key`/`sort_direction` et filtrer par `field_filters`, mais la route
 * HTTP (`GET .../records`) n'expose aujourd'hui que `status`, `include_archived`,
 * `limit`, `offset` — pas de tri ni de filtre par champ personnalisé côté API. Ne pas
 * ajouter ces paramètres ici tant que la route ne les accepte pas réellement : ça
 * afficherait un tri qui n'aurait aucun effet, un faux contrôle plutôt qu'une absence
 * honnête (recherche/filtres avancés = lot 3, voir PRODUCT.md §10.2).
 */

export interface ListRecordsParams {
  status?: string;
  includeArchived?: boolean;
  limit: number;
  offset: number;
}

export function listRecords(
  accessToken: string,
  organizationId: string,
  modelId: string,
  params: ListRecordsParams,
): Promise<RecordListOut> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.includeArchived) search.set("include_archived", "true");
  search.set("limit", String(params.limit));
  search.set("offset", String(params.offset));
  return apiRequest<RecordListOut>(
    `/organizations/${organizationId}/model-definitions/${modelId}/records?${search.toString()}`,
    { accessToken },
  );
}

export function getRecord(
  accessToken: string,
  organizationId: string,
  recordId: string,
): Promise<RecordOut> {
  return apiRequest<RecordOut>(`/organizations/${organizationId}/records/${recordId}`, {
    accessToken,
  });
}

export function createRecord(
  accessToken: string,
  organizationId: string,
  modelId: string,
  payload: RecordCreate,
): Promise<RecordOut> {
  return apiRequest<RecordOut>(
    `/organizations/${organizationId}/model-definitions/${modelId}/records`,
    { accessToken, method: "POST", body: JSON.stringify(payload) },
  );
}

/** Renvoie `RecordUpdateOut` (pas `RecordOut`) : porte `conflicted_field_keys`,
 * les clés rejetées par la fusion champ par champ de cet appel précis (§11.3). */
export function updateRecord(
  accessToken: string,
  organizationId: string,
  recordId: string,
  payload: RecordUpdate,
): Promise<RecordUpdateOut> {
  return apiRequest<RecordUpdateOut>(`/organizations/${organizationId}/records/${recordId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function archiveRecord(
  accessToken: string,
  organizationId: string,
  recordId: string,
): Promise<RecordOut> {
  return apiRequest<RecordOut>(
    `/organizations/${organizationId}/records/${recordId}/archive`,
    { accessToken, method: "POST" },
  );
}

export function listRecordEvents(
  accessToken: string,
  organizationId: string,
  recordId: string,
): Promise<RecordEventOut[]> {
  return apiRequest<RecordEventOut[]>(
    `/organizations/${organizationId}/records/${recordId}/events`,
    { accessToken },
  );
}

export function addRecordEvent(
  accessToken: string,
  organizationId: string,
  recordId: string,
  payload: RecordEventCreate,
): Promise<RecordEventOut> {
  return apiRequest<RecordEventOut>(
    `/organizations/${organizationId}/records/${recordId}/events`,
    { accessToken, method: "POST", body: JSON.stringify(payload) },
  );
}
