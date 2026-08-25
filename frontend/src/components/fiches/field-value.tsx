"use client";

/**
 * FieldValueView — le pendant "lecture seule" de `FieldRenderer` (voir
 * `field-renderer.tsx` pour l'API de saisie). À partir d'une `FieldDefinitionOut`
 * et de la valeur brute stockée dans `Record.data[field.key]`, affiche un rendu
 * adapté au type : badge de statut pour une Échéance, lien `tel:` pour un
 * Téléphone, vignettes pour des Photos, etc.
 *
 * Deux gabarits :
 * - `compact` (par défaut dans les colonnes de tableau) : une ligne, tronquée,
 *   pas de vignette — pensé pour rester lisible sur 50 lignes à la fois.
 * - non compact (vue détail d'une fiche) : rendu complet, badges avec texte,
 *   pièces jointes cliquables — l'URL signée est relue à chaque affichage
 *   (`getDocument`, §14.1) plutôt que mise en cache, pour rester valide même
 *   longtemps après le téléversement.
 *
 * Props :
 *   <FieldValueView field={field} value={record.data[field.key]} recordId={record.id} organizationId={...} accessToken={...} />
 * `recordId`/`organizationId`/`accessToken` sont facultatifs mais nécessaires pour
 * résoudre une pièce jointe (types Document/Photo/Échéance) et le titre d'une
 * fiche liée (type Lien vers une fiche) — sans eux, ces types retombent sur un
 * identifiant brut plutôt que de planter.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, ExternalLink, FileText, Image as ImageIcon, Loader2, MapPin, Phone, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MediaViewer } from "@/components/ui/media-viewer";
import { getDocument } from "@/lib/api/documents";
import { getModelDefinition } from "@/lib/api/model-definitions";
import { getRecord } from "@/lib/api/records";
import type {
  DocumentFieldValue,
  DueDateFieldValue,
  FieldDefinitionOut,
  PhotoFieldValue,
  PositionFieldValue,
  RecordLinkFieldValue,
} from "@/lib/api/types";
import { computeDueDateStatus, DUE_DATE_TONE_CLASSES } from "@/lib/due-date-status";
import { formatFileSize } from "@/lib/documents-cache";
import { useCurrencyFormat } from "@/lib/use-currency-format";
import { cn } from "@/lib/utils";

export interface FieldValueViewProps {
  field: FieldDefinitionOut;
  value: unknown;
  recordId?: string;
  organizationId?: string;
  accessToken?: string;
  compact?: boolean;
  currencyCode?: string;
}

const EMPTY = <span className="text-muted-foreground">—</span>;

export function FieldValueView({
  field,
  value,
  recordId,
  organizationId,
  accessToken,
  compact = false,
  currencyCode,
}: FieldValueViewProps) {
  const formatMoney = useCurrencyFormat();

  if (value === null || value === undefined || value === "") {
    return EMPTY;
  }

  switch (field.field_type) {
    case "text_short":
    case "text_long":
      return <span className={compact ? "truncate" : "whitespace-pre-wrap"}>{String(value)}</span>;

    case "code":
      return <span className="font-mono text-sm">{String(value)}</span>;

    case "phone": {
      const phone = String(value);
      return (
        <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
          <Phone className="size-3.5 shrink-0" />
          {phone}
        </a>
      );
    }

    case "number":
      return (
        <span>
          {new Intl.NumberFormat("fr-FR").format(Number(value))}
          {field.number_unit ? <span className="text-muted-foreground"> {field.number_unit}</span> : null}
        </span>
      );

    case "amount":
      return <span>{formatMoney(Number(value), currencyCode)}</span>;

    case "date":
      return <span>{formatShortDate(String(value))}</span>;

    case "boolean":
      return value === true ? (
        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
          <CircleCheck className="size-3" />
          Oui
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          <X className="size-3" />
          Non
        </Badge>
      );

    case "select": {
      const values = field.select_multiple
        ? Array.isArray(value)
          ? (value as string[])
          : []
        : [String(value)];
      if (values.length === 0) return EMPTY;
      const labelFor = (v: string) => field.select_options?.find((o) => o.value === v)?.label ?? v;
      return (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary">
              {labelFor(v)}
            </Badge>
          ))}
        </div>
      );
    }

    case "due_date": {
      const dueDate = value as DueDateFieldValue;
      if (!dueDate?.due_date) return EMPTY;
      const status = computeDueDateStatus(dueDate.due_date, field.reminder_offsets_days);
      return (
        <div className={cn("flex items-center gap-2", !compact && "flex-wrap")}>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              DUE_DATE_TONE_CLASSES[status.tone],
            )}
          >
            {status.label}
          </span>
          {!compact ? (
            <>
              <span className="text-sm text-muted-foreground">{formatShortDate(dueDate.due_date)}</span>
              {dueDate.document_id ? (
                <DocumentChip
                  documentId={dueDate.document_id}
                  recordId={recordId}
                  organizationId={organizationId}
                  accessToken={accessToken}
                />
              ) : null}
            </>
          ) : null}
        </div>
      );
    }

    case "document": {
      const doc = value as DocumentFieldValue;
      if (!doc?.document_id) return EMPTY;
      if (compact) {
        return (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <FileText className="size-3.5" />
            Document
          </span>
        );
      }
      return (
        <DocumentChip
          documentId={doc.document_id}
          recordId={recordId}
          organizationId={organizationId}
          accessToken={accessToken}
        />
      );
    }

    case "photo": {
      const photo = value as PhotoFieldValue;
      const ids = photo?.document_ids ?? [];
      if (ids.length === 0) return EMPTY;
      if (compact) {
        return (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ImageIcon className="size-3.5" />
            {ids.length} photo{ids.length > 1 ? "s" : ""}
          </span>
        );
      }
      return (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <PhotoThumbnail
              key={id}
              documentId={id}
              recordId={recordId}
              organizationId={organizationId}
              accessToken={accessToken}
            />
          ))}
        </div>
      );
    }

    case "position": {
      const pos = value as PositionFieldValue;
      if (typeof pos?.lat !== "number" || typeof pos?.lng !== "number") return EMPTY;
      return (
        <a
          href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          <MapPin className="size-3.5 shrink-0" />
          {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      );
    }

    case "record_link": {
      const link = value as RecordLinkFieldValue;
      if (!link?.record_id) return EMPTY;
      return (
        <RecordLinkValue
          recordId={link.record_id}
          organizationId={organizationId}
          accessToken={accessToken}
        />
      );
    }

    default:
      return EMPTY;
  }
}

function formatShortDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

function useDocumentQuery(
  documentId: string,
  recordId?: string,
  organizationId?: string,
  accessToken?: string,
) {
  return useQuery({
    queryKey: ["document", organizationId, recordId, documentId],
    queryFn: () => getDocument(accessToken as string, organizationId as string, recordId as string, documentId),
    enabled: Boolean(organizationId && accessToken && recordId),
    staleTime: 60_000,
    retry: false,
  });
}

function DocumentChip({
  documentId,
  recordId,
  organizationId,
  accessToken,
}: {
  documentId: string;
  recordId?: string;
  organizationId?: string;
  accessToken?: string;
}) {
  const query = useDocumentQuery(documentId, recordId, organizationId, accessToken);
  const [viewerOpen, setViewerOpen] = useState(false);

  if (query.isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        Document…
      </span>
    );
  }

  if (query.data) {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-muted/70"
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="max-w-40 truncate">{query.data.filename}</span>
          <span className="text-muted-foreground">{formatFileSize(query.data.size_bytes)}</span>
        </button>
        <MediaViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          url={query.data.url}
          filename={query.data.filename}
          contentType={query.data.content_type}
        />
      </>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      title="Document introuvable ou inaccessible."
    >
      <FileText className="size-3.5 shrink-0" />
      {`Document (${documentId.slice(0, 8)}…)`}
    </span>
  );
}

function PhotoThumbnail({
  documentId,
  recordId,
  organizationId,
  accessToken,
}: {
  documentId: string;
  recordId?: string;
  organizationId?: string;
  accessToken?: string;
}) {
  const query = useDocumentQuery(documentId, recordId, organizationId, accessToken);
  const [viewerOpen, setViewerOpen] = useState(false);

  if (query.isLoading) {
    return (
      <span className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </span>
    );
  }

  if (query.data && query.data.content_type.startsWith("image/")) {
    return (
      <>
        <button type="button" onClick={() => setViewerOpen(true)} title={query.data.filename} className="cursor-zoom-in">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée à courte
              durée de vie, hors domaine configurable pour next/image ; une balise
              <img> simple évite d'ajouter ce domaine dynamique à la configuration. */}
          <img
            src={query.data.url}
            alt={query.data.filename}
            className="size-16 rounded-lg border border-border object-cover transition-transform hover:scale-105"
          />
        </button>
        <MediaViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          url={query.data.url}
          filename={query.data.filename}
          contentType={query.data.content_type}
        />
      </>
    );
  }

  return (
    <span
      className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground"
      title="Photo introuvable ou inaccessible."
    >
      <ImageIcon className="size-5" />
    </span>
  );
}

function RecordLinkValue({
  recordId,
  organizationId,
  accessToken,
}: {
  recordId: string;
  organizationId?: string;
  accessToken?: string;
}) {
  const query = useQuery({
    queryKey: ["record-link", organizationId, recordId],
    queryFn: async () => {
      if (!organizationId || !accessToken) return null;
      const record = await getRecord(accessToken, organizationId, recordId);
      const model = await getModelDefinition(accessToken, organizationId, record.model_definition_id);
      const title =
        model.title_field_key && typeof record.data[model.title_field_key] === "string"
          ? (record.data[model.title_field_key] as string)
          : `Fiche ${record.id.slice(0, 8)}`;
      return { title, recordId: record.id };
    },
    enabled: Boolean(organizationId && accessToken),
    staleTime: 60_000,
    retry: false,
  });

  if (!organizationId || !accessToken) {
    return <span className="font-mono text-xs text-muted-foreground">{recordId.slice(0, 8)}…</span>;
  }
  if (query.isLoading) {
    return <span className="text-sm text-muted-foreground">Chargement…</span>;
  }
  if (!query.data) {
    return (
      <span className="font-mono text-xs text-muted-foreground" title="Fiche introuvable ou inaccessible.">
        {recordId.slice(0, 8)}…
      </span>
    );
  }
  return (
    <Link href={`/r/${query.data.recordId}`} className="text-primary hover:underline">
      {query.data.title}
    </Link>
  );
}
