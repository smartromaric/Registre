import { apiRequest } from "./http";
import type { InvoiceOut, PaymentDeclare, PaymentOut, SubscriptionOut } from "./types";

/**
 * Client de l'écran d'abonnement d'une organisation (cahier des charges §12).
 * Même pattern que `stock.ts`/`dashboards.ts` : `accessToken` en premier
 * paramètre, `apiRequest` lève `ApiError` sur tout échec. Schémas backend :
 * `backend/app/schemas/subscription.py`. Route :
 * `backend/app/api/v1/routers/subscriptions.py`.
 *
 * `GET .../subscription` est accessible à tout membre de l'organisation
 * (rôle quelconque) ; les trois autres routes exigent le rôle ADMIN côté
 * backend (`require_role(OrgRole.ADMIN)`) — l'UI doit refléter cette
 * dissymétrie plutôt que de tenter l'appel et laisser échouer en 403.
 */

const orgBase = (organizationId: string) => `/organizations/${organizationId}`;

/** 404 (`ApiError.status === 404`) si l'organisation n'a exceptionnellement
 * aucun abonnement — ne devrait pas arriver en pratique (un essai est créé
 * avec chaque organisation) mais reste un état à afficher honnêtement plutôt
 * qu'un écran qui plante. */
export function getSubscription(accessToken: string, organizationId: string): Promise<SubscriptionOut> {
  return apiRequest<SubscriptionOut>(`${orgBase(organizationId)}/subscription`, { accessToken });
}

/** ADMIN uniquement. « J'ai payé » (§12.4) : l'organisation déclare, l'éditeur
 * vérifie et valide ensuite (voir `lib/api/editor.ts`). */
export function declarePayment(
  accessToken: string,
  organizationId: string,
  payload: PaymentDeclare,
): Promise<PaymentOut> {
  return apiRequest<PaymentOut>(`${orgBase(organizationId)}/payments`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** ADMIN uniquement. Historique complet de l'organisation, toutes statuts
 * confondus, du plus récent au plus ancien. */
export function listPayments(accessToken: string, organizationId: string): Promise<PaymentOut[]> {
  return apiRequest<PaymentOut[]>(`${orgBase(organizationId)}/payments`, { accessToken });
}

/** ADMIN uniquement. Factures émises automatiquement à chaque validation de
 * paiement — données seules, pas de PDF (non construit en v1). */
export function listInvoices(accessToken: string, organizationId: string): Promise<InvoiceOut[]> {
  return apiRequest<InvoiceOut[]>(`${orgBase(organizationId)}/invoices`, { accessToken });
}
