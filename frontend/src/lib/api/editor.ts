import { apiRequest } from "./http";
import type {
  CurrencyCreate,
  CurrencyOut,
  CurrencyUpdate,
  LifecycleScanResult,
  OfferCreate,
  OfferOut,
  OfferUpdate,
  OrganizationSummaryOut,
  PaymentOut,
  PaymentRecordManual,
  PaymentReject,
  PaymentValidate,
  SubscriptionAdminAdjust,
  SubscriptionOut,
} from "./types";

/**
 * Client de l'espace éditeur (cahier des charges §13) — surface plateforme
 * séparée de l'application organisationnelle, réservée aux utilisateurs
 * `User.is_platform_admin === true` (`require_platform_admin` côté backend,
 * un indicateur de plateforme sans rapport avec `OrgRole`/`Membership`, voir
 * `lib/auth/route-guards.ts:useRequirePlatformAdmin`). Même pattern que
 * `stock.ts`/`dashboards.ts` : `accessToken` en premier paramètre,
 * `apiRequest` lève `ApiError` sur tout échec. Schémas backend :
 * `backend/app/schemas/subscription.py`. Route :
 * `backend/app/api/v1/routers/editor.py`.
 */

// --- offres et devises (§13) ---------------------------------------------------------

/** Toutes les offres, actives ou non — contrairement à `lib/api/catalog.ts`
 * (réservé aux organisations, actives uniquement), l'éditeur doit pouvoir
 * retrouver une offre désactivée pour la réactiver. */
export function listOffers(accessToken: string): Promise<OfferOut[]> {
  return apiRequest<OfferOut[]>("/editor/offers", { accessToken });
}

export function createOffer(accessToken: string, payload: OfferCreate): Promise<OfferOut> {
  return apiRequest<OfferOut>("/editor/offers", { accessToken, method: "POST", body: JSON.stringify(payload) });
}

export function updateOffer(accessToken: string, offerId: string, payload: OfferUpdate): Promise<OfferOut> {
  return apiRequest<OfferOut>(`/editor/offers/${offerId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Toutes les devises, actives ou non — même raison que `listOffers`. */
export function listCurrencies(accessToken: string): Promise<CurrencyOut[]> {
  return apiRequest<CurrencyOut[]>("/editor/currencies", { accessToken });
}

export function createCurrency(accessToken: string, payload: CurrencyCreate): Promise<CurrencyOut> {
  return apiRequest<CurrencyOut>("/editor/currencies", { accessToken, method: "POST", body: JSON.stringify(payload) });
}

export function updateCurrency(
  accessToken: string,
  currencyId: string,
  payload: CurrencyUpdate,
): Promise<CurrencyOut> {
  return apiRequest<CurrencyOut>(`/editor/currencies/${currencyId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// --- organisations et abonnements (§13) -----------------------------------------------

export function listOrganizations(accessToken: string): Promise<OrganizationSummaryOut[]> {
  return apiRequest<OrganizationSummaryOut[]>("/editor/organizations", { accessToken });
}

/** Prolongation/suspension/réactivation manuelle — `reason` est obligatoire
 * côté backend et inscrit au journal d'audit (§12.4, §13). */
export function adjustSubscription(
  accessToken: string,
  organizationId: string,
  payload: SubscriptionAdminAdjust,
): Promise<SubscriptionOut> {
  return apiRequest<SubscriptionOut>(`/editor/organizations/${organizationId}/subscription/adjust`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Déclenchement manuel du balayage automatique de cycle de vie (essai/actif
 * → lecture seule → suspendu → archivé selon le temps écoulé) — le backend
 * n'a pas encore de tâche planifiée pour l'exécuter seul (§12.3). */
export function runLifecycleScan(accessToken: string): Promise<LifecycleScanResult> {
  return apiRequest<LifecycleScanResult>("/editor/subscriptions/run-lifecycle-scan", {
    accessToken,
    method: "POST",
  });
}

// --- règlements (§12.4, §13) -----------------------------------------------------------

/** La file des règlements déclarés à traiter — uniquement `status: "declared"`,
 * du plus ancien au plus récent (ordre de traitement de la file). */
export function listDeclaredPayments(accessToken: string): Promise<PaymentOut[]> {
  return apiRequest<PaymentOut[]>("/editor/payments", { accessToken });
}

/** 409 (`ApiError.status === 409`) si un autre éditeur a déjà traité ce
 * paiement entre-temps — à afficher comme « déjà traité », pas une erreur
 * générique (voir §13, file partagée). Renouvelle l'abonnement et émet la
 * facture automatiquement, rien d'autre à déclencher côté appelant. */
export function validatePayment(
  accessToken: string,
  paymentId: string,
  payload: PaymentValidate,
): Promise<PaymentOut> {
  return apiRequest<PaymentOut>(`/editor/payments/${paymentId}/validate`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Même sémantique 409 que `validatePayment`. */
export function rejectPayment(accessToken: string, paymentId: string, payload: PaymentReject): Promise<PaymentOut> {
  return apiRequest<PaymentOut>(`/editor/payments/${paymentId}/reject`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Paiement reçu par un canal sans déclaration préalable (§12.4) — crée
 * directement un paiement validé et sa facture. */
export function recordManualPayment(accessToken: string, payload: PaymentRecordManual): Promise<PaymentOut> {
  return apiRequest<PaymentOut>("/editor/payments/manual", {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}
