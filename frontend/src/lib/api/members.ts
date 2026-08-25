import { apiRequest } from "./http";
import type { MembershipInvite, MembershipInviteOut, MembershipOut, MembershipUpdate } from "./types";

/**
 * Client des membres d'organisation (cahier des charges §4.4,
 * MANUEL_UTILISATION.md §2 "Inviter des collègues"). Même pattern que
 * `stock.ts`/`editor.ts` : `accessToken` en premier paramètre, `apiRequest`
 * lève `ApiError` sur tout échec. Schémas backend :
 * `backend/app/schemas/membership.py`. Route :
 * `backend/app/api/v1/routers/members.py`.
 *
 * Asymétrie de droits côté backend, à connaître avant de gater l'UI : lister
 * les membres (`GET`) n'exige que l'appartenance active à l'organisation
 * (`get_org_context`) — mais inviter et modifier un membre exigent le rôle
 * ADMIN (`role_can(..., Action.MANAGE_MEMBERS)`, 403 sinon). L'écran
 * `app/(app)/organisation/membres/page.tsx` réserve malgré tout l'écran entier
 * à l'ADMIN, car lister sans pouvoir agir n'a pas d'utilité ici.
 */

const membersBase = (organizationId: string) => `/organizations/${organizationId}/members`;

export function listMembers(accessToken: string, organizationId: string): Promise<MembershipOut[]> {
  return apiRequest<MembershipOut[]>(membersBase(organizationId), { accessToken });
}

/** Si `invitation_email_sent` est `false` et `invitation_link` non nul, le
 * membre est bien créé mais aucun SMTP n'est configuré côté serveur pour
 * envoyer l'e-mail : le lien doit être transmis à la main (voir
 * `components/members/invite-member-dialog.tsx`), jamais un simple toast de
 * succès qui laisserait l'invitation bloquée sans recours. */
export function inviteMember(
  accessToken: string,
  organizationId: string,
  payload: MembershipInvite,
): Promise<MembershipInviteOut> {
  return apiRequest<MembershipInviteOut>(membersBase(organizationId), {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Sert aussi bien à changer un rôle, basculer `can_view_amounts` (§4.2) qu'à
 * désactiver un membre (`is_active: false`, réversible) — jamais une
 * suppression : l'historique et les fiches créées par ce membre restent
 * intacts. */
export function updateMember(
  accessToken: string,
  organizationId: string,
  membershipId: string,
  payload: MembershipUpdate,
): Promise<MembershipOut> {
  return apiRequest<MembershipOut>(`${membersBase(organizationId)}/${membershipId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
