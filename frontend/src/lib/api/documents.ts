import { apiRequest } from "./http";
import type { DocumentWithUrlOut } from "./types";

/**
 * Client des documents/photos (cahier des charges §5.2).
 *
 * Garde-fou de taille alignée sur `documents.py:MAX_UPLOAD_BYTES` (15 Mo) — un
 * simple confort pour échouer vite côté client, le backend reste la seule autorité.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const base = (organizationId: string, recordId: string) =>
  `/organizations/${organizationId}/records/${recordId}/documents`;

export function uploadDocument(
  accessToken: string,
  organizationId: string,
  recordId: string,
  file: File,
  fieldKey?: string,
): Promise<DocumentWithUrlOut> {
  const form = new FormData();
  form.set("file", file);
  // `field_key` doit être un champ du corps multipart, pas un paramètre de
  // requête : cette route FastAPI mélange `UploadFile` et un paramètre simple
  // dans le même corps de formulaire — vérifié contre le backend réel (un envoi
  // en query string est silencieusement ignoré, `field_key` reste `null`).
  if (fieldKey) form.set("field_key", fieldKey);
  return apiRequest<DocumentWithUrlOut>(base(organizationId, recordId), {
    accessToken,
    method: "POST",
    body: form,
  });
}

/** Liste les documents d'une fiche, chacun avec une URL signée fraîche. */
export function listDocuments(
  accessToken: string,
  organizationId: string,
  recordId: string,
): Promise<DocumentWithUrlOut[]> {
  return apiRequest<DocumentWithUrlOut[]>(base(organizationId, recordId), { accessToken });
}

/** Relit un document déjà téléversé — renouvelle son URL signée (§14.1 : durée de
 * vie courte) même longtemps après le téléversement initial. */
export function getDocument(
  accessToken: string,
  organizationId: string,
  recordId: string,
  documentId: string,
): Promise<DocumentWithUrlOut> {
  return apiRequest<DocumentWithUrlOut>(`${base(organizationId, recordId)}/${documentId}`, { accessToken });
}
