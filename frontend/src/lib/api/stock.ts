import { apiRequest } from "./http";
import type {
  AdjustmentCreate,
  ArticleConfigCreate,
  ArticleVariantOut,
  ArticleWithVariantsOut,
  ConsignmentActionCreate,
  ConsignmentSummaryOut,
  DepotCreate,
  DepotOut,
  DepotThresholdOut,
  DepotUpdate,
  MovementCreate,
  MovementListOut,
  MovementOut,
  StockLevelOut,
  StockLotOut,
  ThresholdSet,
  TransferCreate,
  VariantInput,
} from "./types";

/**
 * Client du module Stock (cahier des charges §7). Même pattern que
 * `records.ts`/`model-definitions.ts` : `accessToken` en premier paramètre,
 * `apiRequest` lève `ApiError` sur tout échec (jamais un succès simulé).
 * Schémas backend : `backend/app/schemas/stock.py`. Route : `backend/app/api/v1/routers/stock.py`.
 *
 * Un article de stock est une fiche (`Record`, nature `stock_item`) — ses
 * données de stock (config, variantes, niveaux, lots, mouvements) sont
 * séparées de `Record.data` et vivent ici, jamais dans `lib/api/records.ts`.
 */

const orgBase = (organizationId: string) => `/organizations/${organizationId}`;

// --- dépôts -----------------------------------------------------------------------

export function listDepots(accessToken: string, organizationId: string): Promise<DepotOut[]> {
  return apiRequest<DepotOut[]>(`${orgBase(organizationId)}/depots`, { accessToken });
}

export function createDepot(
  accessToken: string,
  organizationId: string,
  payload: DepotCreate,
): Promise<DepotOut> {
  return apiRequest<DepotOut>(`${orgBase(organizationId)}/depots`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDepot(
  accessToken: string,
  organizationId: string,
  depotId: string,
  payload: DepotUpdate,
): Promise<DepotOut> {
  return apiRequest<DepotOut>(`${orgBase(organizationId)}/depots/${depotId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// --- articles / variantes -----------------------------------------------------------

/** 404 (`ApiError.status === 404`) = cette fiche n'est pas encore configurée
 * comme article de stock — état normal juste après création d'une fiche de
 * modèle `stock_item`, pas une erreur à afficher telle quelle (voir `StockPanel`). */
export function getArticle(
  accessToken: string,
  organizationId: string,
  recordId: string,
): Promise<ArticleWithVariantsOut> {
  return apiRequest<ArticleWithVariantsOut>(`${orgBase(organizationId)}/records/${recordId}/article`, {
    accessToken,
  });
}

/** Configure l'article une première fois (unité, prix, déclinaison en
 * variantes, suivi de lots, consignation). Ne peut être appelé qu'une fois par
 * fiche — le backend renvoie déjà l'article existant via `getArticle` sinon. */
export function configureArticle(
  accessToken: string,
  organizationId: string,
  recordId: string,
  payload: ArticleConfigCreate,
): Promise<ArticleWithVariantsOut> {
  return apiRequest<ArticleWithVariantsOut>(`${orgBase(organizationId)}/records/${recordId}/article-config`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Ajoute une variante supplémentaire à un article déjà configuré. */
export function addVariant(
  accessToken: string,
  organizationId: string,
  recordId: string,
  payload: VariantInput,
): Promise<ArticleVariantOut> {
  return apiRequest<ArticleVariantOut>(`${orgBase(organizationId)}/records/${recordId}/variants`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** `payload.depot_id: null` règle le seuil global de la variante, sinon le
 * seuil spécifique à un dépôt (§7.2 : "réglable globalement et dépôt par dépôt"). */
export function setVariantThreshold(
  accessToken: string,
  organizationId: string,
  variantId: string,
  payload: ThresholdSet,
): Promise<void> {
  return apiRequest<void>(`${orgBase(organizationId)}/variants/${variantId}/threshold`, {
    accessToken,
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listVariantThresholds(
  accessToken: string,
  organizationId: string,
  variantId: string,
): Promise<DepotThresholdOut[]> {
  return apiRequest<DepotThresholdOut[]>(`${orgBase(organizationId)}/variants/${variantId}/thresholds`, {
    accessToken,
  });
}

// --- mouvements (immuables, additifs — jamais modifiés ni supprimés, §7.3) ---------

export function createEntryMovement(
  accessToken: string,
  organizationId: string,
  payload: MovementCreate,
): Promise<MovementOut[]> {
  return apiRequest<MovementOut[]>(`${orgBase(organizationId)}/stock/movements/entry`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Si l'article suit des lots et qu'aucun `lot_number` n'est fourni, le
 * backend consomme automatiquement au plus ancien (FIFO) — peut alors produire
 * plusieurs mouvements, un par lot entamé. */
export function createExitMovement(
  accessToken: string,
  organizationId: string,
  payload: MovementCreate,
): Promise<MovementOut[]> {
  return apiRequest<MovementOut[]>(`${orgBase(organizationId)}/stock/movements/exit`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createAdjustmentMovement(
  accessToken: string,
  organizationId: string,
  payload: AdjustmentCreate,
): Promise<MovementOut> {
  return apiRequest<MovementOut>(`${orgBase(organizationId)}/stock/movements/adjustment`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createTransferMovement(
  accessToken: string,
  organizationId: string,
  payload: TransferCreate,
): Promise<MovementOut[]> {
  return apiRequest<MovementOut[]>(`${orgBase(organizationId)}/stock/movements/transfer`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ListMovementsParams {
  variantId?: string;
  depotId?: string;
  recordId?: string;
  limit: number;
  offset: number;
}

export function listMovements(
  accessToken: string,
  organizationId: string,
  params: ListMovementsParams,
): Promise<MovementListOut> {
  const search = new URLSearchParams();
  if (params.variantId) search.set("variant_id", params.variantId);
  if (params.depotId) search.set("depot_id", params.depotId);
  if (params.recordId) search.set("record_id", params.recordId);
  search.set("limit", String(params.limit));
  search.set("offset", String(params.offset));
  return apiRequest<MovementListOut>(`${orgBase(organizationId)}/stock/movements?${search.toString()}`, {
    accessToken,
  });
}

// --- lecture (niveaux / lots / consignation) ----------------------------------------

export interface ListStockLevelsParams {
  variantId?: string;
  depotId?: string;
}

export function listStockLevels(
  accessToken: string,
  organizationId: string,
  params: ListStockLevelsParams = {},
): Promise<StockLevelOut[]> {
  const search = new URLSearchParams();
  if (params.variantId) search.set("variant_id", params.variantId);
  if (params.depotId) search.set("depot_id", params.depotId);
  const qs = search.toString();
  return apiRequest<StockLevelOut[]>(`${orgBase(organizationId)}/stock/levels${qs ? `?${qs}` : ""}`, {
    accessToken,
  });
}

export interface ListStockLotsParams {
  variantId?: string;
  depotId?: string;
  includeEmpty?: boolean;
  /** AAAA-MM-JJ — ne renvoie que les lots expirant avant cette date. */
  expiringBefore?: string;
}

/** Exclut les lots épuisés par défaut (`includeEmpty: false`). */
export function listStockLots(
  accessToken: string,
  organizationId: string,
  params: ListStockLotsParams = {},
): Promise<StockLotOut[]> {
  const search = new URLSearchParams();
  if (params.variantId) search.set("variant_id", params.variantId);
  if (params.depotId) search.set("depot_id", params.depotId);
  if (params.includeEmpty) search.set("include_empty", "true");
  if (params.expiringBefore) search.set("expiring_before", params.expiringBefore);
  const qs = search.toString();
  return apiRequest<StockLotOut[]>(`${orgBase(organizationId)}/stock/lots${qs ? `?${qs}` : ""}`, {
    accessToken,
  });
}

/** N'a de sens que pour un article dont la config porte `is_consigned: true`
 * (§7.6). `deliver_full` incrémente la circulation (et sort du stock plein) ;
 * `return_empty` la décrémente. */
export function recordConsignmentAction(
  accessToken: string,
  organizationId: string,
  payload: ConsignmentActionCreate,
): Promise<ConsignmentSummaryOut> {
  return apiRequest<ConsignmentSummaryOut>(`${orgBase(organizationId)}/stock/consignment-actions`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getConsignmentSummary(
  accessToken: string,
  organizationId: string,
  variantId: string,
  depotId: string,
): Promise<ConsignmentSummaryOut> {
  const search = new URLSearchParams({ variant_id: variantId, depot_id: depotId });
  return apiRequest<ConsignmentSummaryOut>(`${orgBase(organizationId)}/stock/consignment-summary?${search.toString()}`, {
    accessToken,
  });
}
