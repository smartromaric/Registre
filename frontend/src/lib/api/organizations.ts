import { apiRequest } from "./http";
import type {
  OrganizationCreate,
  OrganizationOut,
  OrganizationUpdate,
  OrganizationWithRole,
} from "./types";

export function listOrganizations(accessToken: string): Promise<OrganizationWithRole[]> {
  return apiRequest<OrganizationWithRole[]>("/organizations", { accessToken });
}

export function getOrganization(
  accessToken: string,
  organizationId: string,
): Promise<OrganizationWithRole> {
  return apiRequest<OrganizationWithRole>(`/organizations/${organizationId}`, { accessToken });
}

export function updateOrganization(
  accessToken: string,
  organizationId: string,
  payload: OrganizationUpdate,
): Promise<OrganizationOut> {
  return apiRequest<OrganizationOut>(`/organizations/${organizationId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Étape 2 de l'inscription (§4.4) : POST /api/v1/auth/organizations, appelée une
 * fois authentifié mais avant qu'aucune organisation n'existe encore. */
export function onboardOrganization(
  accessToken: string,
  payload: OrganizationCreate,
): Promise<OrganizationWithRole> {
  return apiRequest<OrganizationWithRole>("/auth/organizations", {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}
