import { apiRequest } from "./http";
import type { SearchHitOut } from "./types";

/**
 * Client de la recherche globale (cahier des charges §9) — une seule route,
 * `GET /organizations/{id}/search?q=...&model_id=...`, qui interroge tous les
 * modèles actifs de l'organisation sur leurs champs texte marqués filtrables
 * (plus le champ-titre de chaque modèle). `modelId` restreint la recherche à
 * un seul modèle quand on le connaît déjà.
 *
 * Aucun appelant aujourd'hui ne connaît de modèle cible à l'avance : le champ
 * "Lien vers une fiche" (`field-renderer.tsx`) ne porte aucune information sur
 * le modèle visé — `FieldDefinitionOut` n'a pas ce réglage — donc il cherche
 * sans `modelId`, sur tous les modèles, et affiche le nom du modèle à côté de
 * chaque résultat pour que l'utilisateur distingue les fiches entre elles.
 */
export interface SearchRecordsParams {
  q: string;
  modelId?: string;
}

export function searchRecords(
  accessToken: string,
  organizationId: string,
  params: SearchRecordsParams,
): Promise<SearchHitOut[]> {
  const search = new URLSearchParams({ q: params.q });
  if (params.modelId) search.set("model_id", params.modelId);
  return apiRequest<SearchHitOut[]>(
    `/organizations/${organizationId}/search?${search.toString()}`,
    { accessToken },
  );
}
