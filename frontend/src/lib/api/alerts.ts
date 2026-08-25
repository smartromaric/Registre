import { apiRequest } from "./http";
import type { AlertOut, AlertPostpone, AlertStatus, NotificationOut } from "./types";

/**
 * Client du moteur d'alertes et du centre de notifications (cahier des charges
 * §8, PRODUCT.md §10.2). Même pattern que `sync.ts` : `accessToken` en premier
 * paramètre, `apiRequest` lève `ApiError` sur tout échec — jamais un succès simulé.
 * Schémas backend : `backend/app/schemas/alert.py`. Routes : `backend/app/api/v1/routers/alerts.py`.
 *
 * `acknowledgeAlert` et `postponeAlert` répondent 403 si l'appelant n'est ni le
 * destinataire de l'alerte ni ADMIN/MANAGER (`Action.CONFIGURE_ALERTS`) : le
 * gate d'écran correspondant est `canActOnAlert()` dans `lib/alert-format.ts`.
 */

const orgBase = (organizationId: string) => `/organizations/${organizationId}`;

export interface ListAlertsParams {
  status?: AlertStatus;
  /** Le backend filtre sur le destinataire **par défaut** (`mine_only=true`) :
   * voir toute l'organisation impose donc d'envoyer explicitement `false`. */
  mineOnly?: boolean;
}

export function listAlerts(
  accessToken: string,
  organizationId: string,
  params: ListAlertsParams = {},
): Promise<AlertOut[]> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  search.set("mine_only", String(params.mineOnly ?? true));
  return apiRequest<AlertOut[]>(`${orgBase(organizationId)}/alerts?${search.toString()}`, { accessToken });
}

export function acknowledgeAlert(
  accessToken: string,
  organizationId: string,
  alertId: string,
): Promise<AlertOut> {
  return apiRequest<AlertOut>(`${orgBase(organizationId)}/alerts/${alertId}/acknowledge`, {
    accessToken,
    method: "POST",
  });
}

export function postponeAlert(
  accessToken: string,
  organizationId: string,
  alertId: string,
  payload: AlertPostpone,
): Promise<AlertOut> {
  return apiRequest<AlertOut>(`${orgBase(organizationId)}/alerts/${alertId}/postpone`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ListNotificationsParams {
  unreadOnly?: boolean;
}

/** Le backend renvoie **toutes** les notifications du destinataire, sans
 * pagination ni limite : l'appelant tronque lui-même ce qu'il affiche. */
export function listNotifications(
  accessToken: string,
  organizationId: string,
  params: ListNotificationsParams = {},
): Promise<NotificationOut[]> {
  const search = new URLSearchParams();
  if (params.unreadOnly) search.set("unread_only", "true");
  const qs = search.toString();
  return apiRequest<NotificationOut[]>(`${orgBase(organizationId)}/notifications${qs ? `?${qs}` : ""}`, {
    accessToken,
  });
}

export function markNotificationRead(
  accessToken: string,
  organizationId: string,
  notificationId: string,
): Promise<NotificationOut> {
  return apiRequest<NotificationOut>(`${orgBase(organizationId)}/notifications/${notificationId}/read`, {
    accessToken,
    method: "POST",
  });
}
