import { apiRequest } from "./http";
import type {
  DashboardOut,
  DashboardPeriod,
  DeadlineHitListOut,
  ExpiringLotHitListOut,
  SavedDashboardCreate,
  SavedDashboardOut,
  SavedDashboardUpdate,
  UnderstockHitListOut,
} from "./types";

/**
 * Client des tableaux de bord (cahier des charges §10). Même pattern que
 * `stock.ts`/`model-definitions.ts` : `accessToken` en premier paramètre,
 * `apiRequest` lève `ApiError` sur tout échec (jamais un succès simulé).
 * Schémas backend : `backend/app/schemas/dashboard.py`. Routes :
 * `backend/app/api/v1/routers/dashboards.py`.
 */

const orgBase = (organizationId: string) => `/organizations/${organizationId}`;

// --- tableau de bord calculé (§10.1, §10.2, §10.3) ----------------------------------

export interface DashboardParams {
  modelId?: string | null;
  depotId?: string | null;
  site?: string | null;
  period?: DashboardPeriod;
}

function dashboardSearch(params: DashboardParams): string {
  const search = new URLSearchParams();
  if (params.modelId) search.set("model_id", params.modelId);
  if (params.depotId) search.set("depot_id", params.depotId);
  if (params.site) search.set("site", params.site);
  if (params.period) search.set("period", params.period);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Sans `modelId` : périmètre global (§10.1). Avec : indicateurs propres à la
 * nature du modèle focalisé (§10.2, §10.3) — `attention`/`summary` valent
 * alors `null` et seul `asset` ou `stock` est renseigné. */
export function getDashboard(
  accessToken: string,
  organizationId: string,
  params: DashboardParams = {},
): Promise<DashboardOut> {
  return apiRequest<DashboardOut>(`${orgBase(organizationId)}/dashboard${dashboardSearch(params)}`, {
    accessToken,
  });
}

// --- listes "cliquables" derrière chaque indicateur (§10.5) -------------------------
// Un chiffre qui ne mène nulle part n'a pas sa place : ces trois routes
// partagent exactement le même filtrage que les compteurs qu'elles détaillent.

export interface DeadlineHitsParams {
  status: "overdue" | "upcoming";
  modelId?: string | null;
  site?: string | null;
  limit: number;
  offset: number;
}

export function listDeadlineHits(
  accessToken: string,
  organizationId: string,
  params: DeadlineHitsParams,
): Promise<DeadlineHitListOut> {
  const search = new URLSearchParams({
    status: params.status,
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.modelId) search.set("model_id", params.modelId);
  if (params.site) search.set("site", params.site);
  return apiRequest<DeadlineHitListOut>(`${orgBase(organizationId)}/dashboard/deadlines?${search.toString()}`, {
    accessToken,
  });
}

export interface UnderstockHitsParams {
  modelId?: string | null;
  depotId?: string | null;
  limit: number;
  offset: number;
}

export function listUnderstockHits(
  accessToken: string,
  organizationId: string,
  params: UnderstockHitsParams,
): Promise<UnderstockHitListOut> {
  const search = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  if (params.modelId) search.set("model_id", params.modelId);
  if (params.depotId) search.set("depot_id", params.depotId);
  return apiRequest<UnderstockHitListOut>(`${orgBase(organizationId)}/dashboard/understock?${search.toString()}`, {
    accessToken,
  });
}

export interface ExpiringLotHitsParams {
  modelId?: string | null;
  depotId?: string | null;
  limit: number;
  offset: number;
}

export function listExpiringLotHits(
  accessToken: string,
  organizationId: string,
  params: ExpiringLotHitsParams,
): Promise<ExpiringLotHitListOut> {
  const search = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  if (params.modelId) search.set("model_id", params.modelId);
  if (params.depotId) search.set("depot_id", params.depotId);
  return apiRequest<ExpiringLotHitListOut>(`${orgBase(organizationId)}/dashboard/expiring-lots?${search.toString()}`, {
    accessToken,
  });
}

// --- tableaux de bord enregistrés et épinglés (§10.4) --------------------------------
// Privés à leur créateur, comme les vues enregistrées (§9). Un seul épinglé à
// la fois par utilisateur — épingler en désépingle un autre côté serveur, rien
// à orchestrer ici.

export function listSavedDashboards(
  accessToken: string,
  organizationId: string,
): Promise<SavedDashboardOut[]> {
  return apiRequest<SavedDashboardOut[]>(`${orgBase(organizationId)}/dashboards/saved`, { accessToken });
}

/** `null` si l'utilisateur n'a encore rien épinglé — état normal, pas une erreur. */
export function getPinnedDashboard(
  accessToken: string,
  organizationId: string,
): Promise<SavedDashboardOut | null> {
  return apiRequest<SavedDashboardOut | null>(`${orgBase(organizationId)}/dashboards/saved/pinned`, {
    accessToken,
  });
}

export function createSavedDashboard(
  accessToken: string,
  organizationId: string,
  payload: SavedDashboardCreate,
): Promise<SavedDashboardOut> {
  return apiRequest<SavedDashboardOut>(`${orgBase(organizationId)}/dashboards/saved`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Le backend n'applique que les champs réellement présents dans le corps
 * (`exclude_unset`) : passer seulement `{ is_pinned: true }` ne touche ni le
 * nom ni le périmètre déjà enregistrés. */
export function updateSavedDashboard(
  accessToken: string,
  organizationId: string,
  dashboardId: string,
  payload: SavedDashboardUpdate,
): Promise<SavedDashboardOut> {
  return apiRequest<SavedDashboardOut>(`${orgBase(organizationId)}/dashboards/saved/${dashboardId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteSavedDashboard(
  accessToken: string,
  organizationId: string,
  dashboardId: string,
): Promise<void> {
  return apiRequest<void>(`${orgBase(organizationId)}/dashboards/saved/${dashboardId}`, {
    accessToken,
    method: "DELETE",
  });
}
