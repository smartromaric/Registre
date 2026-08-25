/**
 * Téléversement de document/photo repris par morceaux (cahier des charges
 * §11.3, PRODUCT.md §10.11) : même contrat externe que `uploadDocument`
 * (`lib/api/documents.ts`) pour que les points d'appel (`field-renderer.tsx`)
 * n'aient qu'à changer l'import. En ligne, découpe le fichier et pousse les
 * morceaux manquants ; hors-ligne (réseau injoignable), met la session en
 * file d'attente et rend un aperçu local immédiat.
 */

import { apiRequest } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import type { DocumentWithUrlOut, UploadSessionOut } from "@/lib/api/types";
import {
  completeUploadSession,
  createUploadSession,
  enqueueOperation,
  getUploadSession,
  putUploadChunkAck,
  type UploadSessionRecord,
} from "./db";

// 1 Mo : confortablement sous la borne serveur de 5 Mo/morceau
// (`MAX_CHUNK_BYTES`, `backend/app/services/sync_service.py`) et le plafond
// total de 15 Mo (`MAX_UPLOAD_BYTES`).
const CHUNK_SIZE = 1024 * 1024;

const base = (organizationId: string, recordId: string) =>
  `/organizations/${organizationId}/records/${recordId}/documents`;

/** Aperçu local le temps que la vraie session soit rejouée (§C, moteur de
 * synchro) : `id` est ici l'id de session, pas l'id de document final côté
 * serveur. Le formulaire de fiche ne relit jamais cet id après coup — voir
 * la note dans `uploadDocumentResumable` ci-dessous, c'est la limite connue
 * et assumée de ce lot. */
function toPlaceholder(
  sessionId: string,
  recordId: string,
  fieldKey: string | undefined,
  file: File,
): DocumentWithUrlOut {
  return {
    id: sessionId,
    record_id: recordId,
    field_key: fieldKey ?? null,
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    created_at: new Date().toISOString(),
    url: URL.createObjectURL(file),
  };
}

/** Envoie les morceaux qui manquent encore côté serveur (`chunksReceived`,
 * relu depuis le serveur — source de vérité après une reprise) et tient la
 * session locale à jour au fur et à mesure, pour qu'une coupure au milieu
 * laisse la reprise repartir du bon morceau plutôt que du début. */
async function pushMissingChunks(
  session: UploadSessionRecord,
  chunksReceived: number[],
  accessToken: string,
): Promise<void> {
  const totalChunks = Math.ceil(session.totalBytes / session.chunkSize);
  const received = new Set(chunksReceived);
  for (let index = 0; index < totalChunks; index++) {
    if (received.has(index)) continue;
    const start = index * session.chunkSize;
    const end = Math.min(start + session.chunkSize, session.totalBytes);
    const chunk = session.file.slice(start, end);
    await apiRequest<UploadSessionOut>(
      `${base(session.organizationId, session.recordId)}/uploads/${session.id}/chunks/${index}`,
      { accessToken, method: "PUT", body: chunk },
    );
    await putUploadChunkAck(session.id, index);
  }
}

async function driveToCompletion(
  session: UploadSessionRecord,
  accessToken: string,
): Promise<DocumentWithUrlOut> {
  // Le serveur fait foi pour ce qui a déjà été reçu — pas la session locale,
  // qui peut être en retard si une reprise précédente a été interrompue.
  const status = await apiRequest<UploadSessionOut>(
    `${base(session.organizationId, session.recordId)}/uploads/${session.id}`,
    { accessToken },
  );
  await pushMissingChunks(session, status.chunks_received, accessToken);
  const document = await apiRequest<DocumentWithUrlOut>(
    `${base(session.organizationId, session.recordId)}/uploads/${session.id}/complete`,
    { accessToken, method: "POST" },
  );
  await completeUploadSession(session.id, document.id);
  return document;
}

export async function uploadDocumentResumable(
  accessToken: string,
  organizationId: string,
  recordId: string,
  file: File,
  fieldKey?: string,
): Promise<DocumentWithUrlOut> {
  const sessionId = crypto.randomUUID();
  const session: UploadSessionRecord = {
    id: sessionId,
    organizationId,
    recordId,
    fieldKey: fieldKey ?? null,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    totalBytes: file.size,
    chunkSize: CHUNK_SIZE,
    file,
    chunksAcked: [],
    status: "in_progress",
    documentId: null,
    createdAt: new Date().toISOString(),
  };
  await createUploadSession(session);

  try {
    const created = await apiRequest<UploadSessionOut>(`${base(organizationId, recordId)}/uploads`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({
        id: sessionId,
        field_key: fieldKey ?? null,
        filename: session.filename,
        content_type: session.contentType,
        total_bytes: session.totalBytes,
        chunk_size: session.chunkSize,
      }),
    });
    await pushMissingChunks(session, created.chunks_received, accessToken);
    const document = await apiRequest<DocumentWithUrlOut>(
      `${base(organizationId, recordId)}/uploads/${sessionId}/complete`,
      { accessToken, method: "POST" },
    );
    await completeUploadSession(sessionId, document.id);
    return document;
  } catch (err) {
    if (err instanceof ApiError && err.kind === "network") {
      await enqueueOperation({
        id: crypto.randomUUID(),
        kind: "document.upload",
        organizationId,
        createdAt: new Date().toISOString(),
        status: "pending",
        attempts: 0,
        payload: { uploadSessionId: sessionId },
      });
      return toPlaceholder(sessionId, recordId, fieldKey, file);
    }
    throw err;
  }
}

/** Appelée par le moteur de synchro (`sync-engine.ts`) pour rejouer une
 * session mise en file d'attente — relit la session et le fichier depuis
 * IndexedDB, réconcilie avec le serveur, termine l'envoi. */
export async function resumeUpload(sessionId: string, accessToken: string): Promise<DocumentWithUrlOut> {
  const session = await getUploadSession(sessionId);
  if (!session) {
    // Pas une erreur réseau (le fichier local a disparu, ex. stockage vidé) :
    // ne jamais bloquer indéfiniment la file pour ça, laisser le moteur de
    // synchro classer cette opération "failed" et continuer les suivantes.
    throw new ApiError(
      "Session de téléversement introuvable localement — impossible de reprendre l'envoi.",
      400,
      "http",
    );
  }
  return driveToCompletion(session, accessToken);
}
