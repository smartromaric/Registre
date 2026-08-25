import { apiRequest } from "./http";
import type {
  FieldDefinitionCreate,
  FieldDefinitionOut,
  FieldDefinitionUpdate,
  FieldReorderRequest,
  ModelDefinitionCreate,
  ModelDefinitionOut,
  ModelDefinitionUpdate,
  TemplateSummary,
} from "./types";

/**
 * Client du moteur de fiches — modèles et champs (cahier des charges §5).
 * Même pattern que `organizations.ts` : chaque fonction prend le `accessToken` en
 * premier paramètre et appelle `apiRequest`, qui lève `ApiError` sur tout échec
 * (jamais un succès simulé).
 */

const base = (organizationId: string) => `/organizations/${organizationId}/model-definitions`;

export function listModelDefinitions(
  accessToken: string,
  organizationId: string,
): Promise<ModelDefinitionOut[]> {
  return apiRequest<ModelDefinitionOut[]>(base(organizationId), { accessToken });
}

export function getModelDefinition(
  accessToken: string,
  organizationId: string,
  modelId: string,
): Promise<ModelDefinitionOut> {
  return apiRequest<ModelDefinitionOut>(`${base(organizationId)}/${modelId}`, { accessToken });
}

export function createModelDefinition(
  accessToken: string,
  organizationId: string,
  payload: ModelDefinitionCreate,
): Promise<ModelDefinitionOut> {
  return apiRequest<ModelDefinitionOut>(base(organizationId), {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateModelDefinition(
  accessToken: string,
  organizationId: string,
  modelId: string,
  payload: ModelDefinitionUpdate,
): Promise<ModelDefinitionOut> {
  return apiRequest<ModelDefinitionOut>(`${base(organizationId)}/${modelId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Ajoute un champ à un modèle existant — toujours en fin de liste (position =
 * nombre de champs existants si non précisée côté serveur). */
export function addFieldDefinition(
  accessToken: string,
  organizationId: string,
  modelId: string,
  payload: FieldDefinitionCreate,
): Promise<FieldDefinitionOut> {
  return apiRequest<FieldDefinitionOut>(`${base(organizationId)}/${modelId}/fields`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Modifie un champ déjà créé — jamais sa clé technique ni son type (voir
 * `FieldDefinitionUpdate`) : seuls le libellé et les réglages d'affichage
 * changent, pour ne jamais rompre silencieusement les fiches déjà écrites. */
export function updateFieldDefinition(
  accessToken: string,
  organizationId: string,
  modelId: string,
  fieldId: string,
  payload: FieldDefinitionUpdate,
): Promise<FieldDefinitionOut> {
  return apiRequest<FieldDefinitionOut>(`${base(organizationId)}/${modelId}/fields/${fieldId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Supprime un champ. Le backend refuse (409) tant qu'il sert de titre aux
 * fiches du modèle — choisissez-en un autre d'abord dans les réglages du modèle. */
export function deleteFieldDefinition(
  accessToken: string,
  organizationId: string,
  modelId: string,
  fieldId: string,
): Promise<void> {
  return apiRequest<void>(`${base(organizationId)}/${modelId}/fields/${fieldId}`, {
    accessToken,
    method: "DELETE",
  });
}

/** Réordonne tous les champs d'un modèle en une seule fois — `field_ids` doit
 * contenir exactement les champs existants, dans le nouvel ordre voulu. */
export function reorderFieldDefinitions(
  accessToken: string,
  organizationId: string,
  modelId: string,
  payload: FieldReorderRequest,
): Promise<FieldDefinitionOut[]> {
  return apiRequest<FieldDefinitionOut[]>(`${base(organizationId)}/${modelId}/fields/reorder`, {
    accessToken,
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Bibliothèque de modèles prêts à l'emploi (cahier des charges §5.6). */
export function listTemplates(
  accessToken: string,
  organizationId: string,
): Promise<TemplateSummary[]> {
  return apiRequest<TemplateSummary[]>(`/organizations/${organizationId}/templates`, {
    accessToken,
  });
}

/** Active un modèle de la bibliothèque : en fait une copie propre à l'organisation,
 * sans lien vivant vers le gabarit d'origine (§5.6). */
export function activateTemplate(
  accessToken: string,
  organizationId: string,
  templateKey: string,
): Promise<ModelDefinitionOut> {
  return apiRequest<ModelDefinitionOut>(
    `/organizations/${organizationId}/templates/${templateKey}/activate`,
    { accessToken, method: "POST" },
  );
}
