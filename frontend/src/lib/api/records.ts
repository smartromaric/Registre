import { apiRequest, apiRequestRaw } from "./http";
import type {
  ImportCommitResult,
  ImportMappingSuggestion,
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

/**
 * Import initial (cahier des charges §9) — deux temps, deux appels, le **même
 * fichier** envoyé aux deux : le backend ne garde rien entre l'aperçu et la
 * validation, il relit le fichier à chaque fois.
 *
 * Le corps est un `FormData` : `apiRequest` omet alors son `Content-Type` JSON
 * pour laisser le navigateur poser le `multipart/form-data; boundary=...`
 * (voir `http.ts`). `mapping` part en champ de formulaire *encodé en JSON*, pas
 * en query string — même contrainte FastAPI que `field_key` sur l'envoi de
 * document : une route qui mêle `UploadFile` et `Form(...)` lit tout dans le corps.
 */
export function previewImport(
  accessToken: string,
  organizationId: string,
  modelId: string,
  file: File,
  mapping?: Record<string, string>,
): Promise<ImportMappingSuggestion> {
  const form = new FormData();
  form.set("file", file);
  // Sans `mapping`, l'aperçu est calculé sur la correspondance suggérée. Dès que
  // l'utilisateur en corrige une, on la renvoie : les compteurs doivent décrire
  // la correspondance réellement retenue, pas celle devinée au départ.
  if (mapping) form.set("mapping", JSON.stringify(mapping));
  return apiRequest<ImportMappingSuggestion>(
    `/organizations/${organizationId}/model-definitions/${modelId}/records/import/preview`,
    { accessToken, method: "POST", body: form },
  );
}

/** `mapping` : {en-tête de colonne: clé de champ}. N'y mettre que les colonnes
 * réellement importées — une colonne absente est ignorée par le backend. */
export function commitImport(
  accessToken: string,
  organizationId: string,
  modelId: string,
  file: File,
  mapping: Record<string, string>,
): Promise<ImportCommitResult> {
  const form = new FormData();
  form.set("file", file);
  form.set("mapping", JSON.stringify(mapping));
  return apiRequest<ImportCommitResult>(
    `/organizations/${organizationId}/model-definitions/${modelId}/records/import/commit`,
    { accessToken, method: "POST", body: form },
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

/** Plafond du serveur (`_EXPORT_ROW_LIMIT`). Répliqué ici pour que l'écran
 *  puisse *prévenir* avant l'export plutôt que de laisser l'utilisateur
 *  découvrir un fichier tronqué. Doit rester aligné sur le backend. */
export const EXPORT_ROW_LIMIT = 10_000;

export interface ExportedFile {
  blob: Blob;
  filename: string;
}

/**
 * Export CSV des fiches d'un modèle (cahier des charges §10 — « consulter et
 * exporter » est un droit du rôle Lecteur lui-même).
 *
 * La route existait côté backend depuis le lot 3, **sans aucun appelant côté
 * frontend** : la fonction était donc inatteignable depuis l'application.
 *
 * Passe par `apiRequestRaw` : l'authentification voyage dans un en-tête, ce
 * qu'un simple `<a href>` ne sait pas faire. Le fichier est donc récupéré en
 * mémoire puis remis au navigateur — acceptable, l'export est plafonné à
 * `EXPORT_ROW_LIMIT` lignes.
 */
export async function exportRecordsCsv(
  accessToken: string,
  organizationId: string,
  modelId: string,
  options: { filters?: string; columns?: string[] } = {},
): Promise<ExportedFile> {
  const search = new URLSearchParams();
  if (options.filters) search.set("filters", options.filters);
  if (options.columns?.length) search.set("columns", options.columns.join(","));
  const query = search.toString();

  const response = await apiRequestRaw(
    `/organizations/${organizationId}/model-definitions/${modelId}/records/export.csv${query ? `?${query}` : ""}`,
    { accessToken, headers: { "X-Organization-Id": organizationId } },
  );

  return { blob: await response.blob(), filename: filenameFromDisposition(response) };
}

/**
 * Nom de fichier proposé par le serveur (`Content-Disposition`).
 *
 * Le repli n'est pas décoratif : le navigateur n'expose cet en-tête au script
 * que si le serveur l'autorise explicitement (`Access-Control-Expose-Headers`).
 * Sans repli, un déploiement mal configuré ferait télécharger un fichier nommé
 * « undefined ».
 */
function filenameFromDisposition(response: Response): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";

  // `filename*` D'ABORD, et pas « la première forme rencontrée ».
  // Le serveur envoie les deux, dans l'ordre imposé par le RFC 6266 : le repli
  // ASCII (`filename="Vehicules.csv"`) puis la forme UTF-8
  // (`filename*=UTF-8''V%C3%A9hicules.csv`). Une expression rationnelle qui
  // accepte les deux indifféremment retient donc toujours le repli — et
  // l'accent est perdu alors même que le serveur l'avait transmis.
  const encoded = /filename\*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return encoded[1].trim();
    }
  }

  const plain = /filename=\s*"?([^";]+)"?/i.exec(disposition);
  if (plain?.[1]) return plain[1].trim();

  // Ni l'une ni l'autre : l'en-tête n'est pas exposé par CORS
  // (`Access-Control-Expose-Headers`), ou le serveur ne l'a pas envoyé.
  return "export.csv";
}
