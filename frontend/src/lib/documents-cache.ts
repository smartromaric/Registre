import type { DocumentWithUrlOut } from "./api/types";

/**
 * Mémoire locale du nom/taille d'un document juste après son téléversement, pour
 * que `field-renderer.tsx` (mode édition) puisse afficher son nom immédiatement
 * sans round-trip serveur superflu. Ce n'est qu'un confort d'affichage pendant la
 * session d'édition en cours — jamais une source de vérité ni un substitut à une
 * relecture serveur : pour afficher/ouvrir un document déjà téléversé (mode
 * lecture d'une fiche), voir `getDocument`/`listDocuments` dans
 * `lib/api/documents.ts`, qui renvoient toujours une URL signée fraîche.
 *
 * Portée : `localStorage`, par organisation.
 */

export interface CachedDocument {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  url: string;
  field_key: string | null;
  record_id: string;
}

function storageKey(organizationId: string): string {
  return `registre.documents.${organizationId}`;
}

function readAll(organizationId: string): Record<string, CachedDocument> {
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CachedDocument>;
  } catch {
    return {};
  }
}

function writeAll(organizationId: string, entries: Record<string, CachedDocument>): void {
  try {
    window.localStorage.setItem(storageKey(organizationId), JSON.stringify(entries));
  } catch {
    // Stockage indisponible (navigation privée, quota) : simple confort perdu.
  }
}

export function rememberDocument(organizationId: string, doc: DocumentWithUrlOut): void {
  const entries = readAll(organizationId);
  entries[doc.id] = {
    id: doc.id,
    filename: doc.filename,
    content_type: doc.content_type,
    size_bytes: doc.size_bytes,
    url: doc.url,
    field_key: doc.field_key,
    record_id: doc.record_id,
  };
  writeAll(organizationId, entries);
}

export function getCachedDocument(
  organizationId: string,
  documentId: string,
): CachedDocument | null {
  return readAll(organizationId)[documentId] ?? null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
