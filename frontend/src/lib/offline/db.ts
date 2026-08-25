/**
 * Base IndexedDB de la synchronisation hors-ligne (cahier des charges §11.3,
 * PRODUCT.md §10.11) — trois magasins :
 * - `operations`  : la file d'écritures en attente de synchronisation.
 * - `records_cache` : dernier instantané connu de chaque fiche déjà visitée,
 *   pour qu'une page déjà ouverte une fois reste consultable hors-ligne.
 * - `upload_sessions` : sessions de téléversement repris par morceaux — le
 *   fichier (`Blob`) et la progression, séparés des fiches car volumineux et
 *   pas destinés à être listés aussi souvent.
 *
 * Un seul point d'accès à `idb` dans tout le projet : le reste du code passe
 * par les fonctions exportées ci-dessous, jamais par `openDB` directement.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  AdjustmentCreate,
  MovementCreate,
  RecordOut,
  TransferCreate,
} from "@/lib/api/types";

const DB_NAME = "registre-offline";
const DB_VERSION = 1;

/** Un seul nom d'événement, exporté, pour que la file (écrivain) et l'indicateur
 * de statut (lecteur) restent d'accord sans dépendre l'un de l'autre. */
export const OFFLINE_QUEUE_CHANGED_EVENT = "registre:offline-queue-changed";

function notifyQueueChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_CHANGED_EVENT));
  }
}

export type OperationStatus = "pending" | "syncing" | "failed";

export interface RecordCreatePayload {
  modelId: string;
  recordId: string;
  data: Record<string, unknown>;
  status: string | null;
  site: string | null;
  assigned_person_record_id: string | null;
}

/** `fieldWrittenAt` : horodatage de saisie capturé au moment de la soumission
 * d'origine (pas de la relecture) — voir `record-form.tsx` et PRODUCT.md §10.11. */
export interface RecordUpdatePayload {
  recordId: string;
  data: Record<string, unknown>;
  status: string | null;
  site: string | null;
  assigned_person_record_id: string | null;
  fieldWrittenAt: Record<string, string>;
}

export interface StockMovementPayload {
  kind: "entry" | "exit" | "adjustment" | "transfer";
  body: MovementCreate | AdjustmentCreate | TransferCreate;
}

export interface DocumentUploadPayload {
  uploadSessionId: string;
}

interface QueueOperationBase {
  id: string;
  organizationId: string;
  createdAt: string; // ISO 8601
  status: OperationStatus;
  lastError?: string;
  attempts: number;
}

/** Discriminée par `kind` pour que le moteur de synchro (`sync-engine.ts`)
 * puisse narrower `payload` sans cast. */
export type QueueOperation =
  | (QueueOperationBase & { kind: "record.create"; payload: RecordCreatePayload })
  | (QueueOperationBase & { kind: "record.update"; payload: RecordUpdatePayload })
  | (QueueOperationBase & { kind: "stock.movement"; payload: StockMovementPayload })
  | (QueueOperationBase & { kind: "document.upload"; payload: DocumentUploadPayload });

export interface CachedRecord {
  id: string;
  organizationId: string;
  modelId: string;
  data: RecordOut;
  cachedAt: string; // ISO 8601
}

export interface UploadSessionRecord {
  id: string;
  organizationId: string;
  recordId: string;
  fieldKey: string | null;
  filename: string;
  contentType: string;
  totalBytes: number;
  chunkSize: number;
  file: Blob;
  chunksAcked: number[];
  status: "in_progress" | "completed";
  documentId: string | null;
  createdAt: string; // ISO 8601
}

interface RegistreOfflineDB extends DBSchema {
  operations: {
    key: string;
    value: QueueOperation;
    indexes: { status: OperationStatus; createdAt: string };
  };
  records_cache: {
    key: string;
    value: CachedRecord;
    indexes: { organizationId: string };
  };
  upload_sessions: {
    key: string;
    value: UploadSessionRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<RegistreOfflineDB>> | null = null;

// Ouverture différée (jamais au chargement du module) : ce fichier peut être
// importé depuis un contexte sans `indexedDB` (rendu serveur) sans planter,
// tant qu'aucune fonction n'est réellement appelée là où l'API est absente.
function getDb(): Promise<IDBPDatabase<RegistreOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RegistreOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const operations = db.createObjectStore("operations", { keyPath: "id" });
        operations.createIndex("status", "status");
        operations.createIndex("createdAt", "createdAt");

        const recordsCache = db.createObjectStore("records_cache", { keyPath: "id" });
        recordsCache.createIndex("organizationId", "organizationId");

        db.createObjectStore("upload_sessions", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

// --- file d'opérations -----------------------------------------------------------------

export async function enqueueOperation(operation: QueueOperation): Promise<void> {
  const db = await getDb();
  await db.put("operations", operation);
  notifyQueueChanged();
}

/** Sans `status` : toutes les opérations, triées par `createdAt` croissant
 * (index) — ordre FIFO nécessaire au moteur de synchro (§C : une mise à jour
 * ne doit jamais rejouer avant la création dont elle dépend). */
export async function listOperations(status?: OperationStatus): Promise<QueueOperation[]> {
  const db = await getDb();
  if (status) return db.getAllFromIndex("operations", "status", status);
  return db.getAllFromIndex("operations", "createdAt");
}

export async function countPendingOperations(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("operations", "status", "pending");
}

export async function updateOperationStatus(
  id: string,
  status: OperationStatus,
  lastError?: string,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("operations", "readwrite");
  const existing = await tx.store.get(id);
  if (existing) {
    existing.status = status;
    existing.lastError = lastError;
    // Une tentative commence quand l'opération repasse "syncing" — pas quand
    // elle est simplement remise "pending" après une coupure réseau détectée
    // avant même d'avoir tenté l'appel (voir sync-engine.ts).
    if (status === "syncing") existing.attempts += 1;
    await tx.store.put(existing);
  }
  await tx.done;
  notifyQueueChanged();
}

export async function removeOperation(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("operations", id);
  notifyQueueChanged();
}

/** Appelée en tout début de `runSyncPass` (voir sync-engine.ts) : une opération
 * encore "syncing" à cet instant ne peut venir que d'une passe précédente
 * interrompue avant d'avoir pu se conclure (onglet fermé, appli tuée pendant la
 * requête réseau) — sans cette remise à zéro, une telle opération restait
 * exclue de toute relecture pour toujours, invisible et jamais comptée. */
export async function resetStaleSyncingOperations(): Promise<void> {
  const db = await getDb();
  const stale = await db.getAllFromIndex("operations", "status", "syncing");
  if (stale.length === 0) return;
  const tx = db.transaction("operations", "readwrite");
  for (const op of stale) {
    op.status = "pending";
    await tx.store.put(op);
  }
  await tx.done;
  notifyQueueChanged();
}

// --- cache de fiches ---------------------------------------------------------------------

export async function getCachedRecord(id: string): Promise<CachedRecord | undefined> {
  const db = await getDb();
  return db.get("records_cache", id);
}

export async function putCachedRecord(record: CachedRecord): Promise<void> {
  const db = await getDb();
  await db.put("records_cache", record);
}

/** Utilisé par la vue liste hors-ligne — pas d'index dédié sur `modelId` (un
 * seul index suffisait au périmètre de ce lot), filtrage en mémoire après
 * lecture par organisation : volume raisonnable pour un cache local. */
export async function listCachedRecordsByModel(
  organizationId: string,
  modelId: string,
): Promise<CachedRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("records_cache", "organizationId", organizationId);
  return all.filter((record) => record.modelId === modelId);
}

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

/** §11.5 (plafond de stockage) : pas d'éviction par dépôt dans ce lot (hors
 * périmètre), seulement cette purge simple par ancienneté au démarrage. */
export async function pruneOldCachedRecords(): Promise<void> {
  const db = await getDb();
  const cutoff = Date.now() - TWELVE_MONTHS_MS;
  const tx = db.transaction("records_cache", "readwrite");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (new Date(cursor.value.cachedAt).getTime() < cutoff) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

// --- sessions de téléversement repris par morceaux --------------------------------------

export async function createUploadSession(session: UploadSessionRecord): Promise<void> {
  const db = await getDb();
  await db.put("upload_sessions", session);
}

export async function getUploadSession(id: string): Promise<UploadSessionRecord | undefined> {
  const db = await getDb();
  return db.get("upload_sessions", id);
}

export async function putUploadChunkAck(id: string, chunkIndex: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("upload_sessions", "readwrite");
  const session = await tx.store.get(id);
  if (session && !session.chunksAcked.includes(chunkIndex)) {
    session.chunksAcked = [...session.chunksAcked, chunkIndex].sort((a, b) => a - b);
    await tx.store.put(session);
  }
  await tx.done;
}

export async function completeUploadSession(id: string, documentId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("upload_sessions", "readwrite");
  const session = await tx.store.get(id);
  if (session) {
    session.status = "completed";
    session.documentId = documentId;
    await tx.store.put(session);
  }
  await tx.done;
}
