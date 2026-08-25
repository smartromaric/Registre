import { apiRequest } from "./http";
import type { CurrencyOut, OfferOut } from "./types";

/**
 * Client du catalogue public (cahier des charges §12.1, §12.2) : offres et
 * devises actives, ouvert à tout utilisateur connecté (`get_current_user`,
 * sans notion d'organisation ni de rôle) — utilisé à la fois par l'écran
 * d'abonnement d'une organisation (sélecteur d'offre/devise) et par l'espace
 * éditeur (sélecteurs des formulaires de paiement manuel). Route :
 * `backend/app/api/v1/routers/catalog.py`.
 *
 * Ne renvoie que les entrées actives (`only_active=True` côté backend) — il
 * n'existe pas de route pour lister les offres/devises désactivées, y
 * compris pour l'éditeur (voir `lib/api/editor.ts`).
 */

export function listOffers(accessToken: string): Promise<OfferOut[]> {
  return apiRequest<OfferOut[]>("/catalog/offers", { accessToken });
}

export function listCurrencies(accessToken: string): Promise<CurrencyOut[]> {
  return apiRequest<CurrencyOut[]>("/catalog/currencies", { accessToken });
}
