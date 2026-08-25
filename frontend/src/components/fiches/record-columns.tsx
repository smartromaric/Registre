import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { FieldValueView } from "@/components/fiches/field-value";
import { getRecordTitle } from "@/components/fiches/record-title";
import type { ModelDefinitionOut, RecordOut } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export interface BuildRecordColumnsOptions {
  model: ModelDefinitionOut;
  organizationId: string;
  accessToken: string;
  currencyCode?: string;
}

/**
 * Construit les colonnes de la vue liste d'un modèle à partir de ses
 * `field_definitions` : une colonne titre (clic vers la fiche), une colonne
 * Statut si le modèle en définit, une colonne par champ marqué `show_in_list`
 * (dans l'ordre de `position`), et une colonne de dernière mise à jour. Chaque
 * cellule de champ personnalisé délègue son rendu à `FieldValueView` — voir
 * `components/fiches/field-value.tsx` pour l'API complète.
 */
export function buildRecordColumns({
  model,
  organizationId,
  accessToken,
  currencyCode,
}: BuildRecordColumnsOptions): ColumnDef<RecordOut, unknown>[] {
  const columns: ColumnDef<RecordOut, unknown>[] = [
    {
      id: "title",
      header: model.name_singular,
      cell: ({ row }) => (
        <Link
          href={`/models/${model.id}/records/${row.original.id}`}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {getRecordTitle(row.original, model)}
        </Link>
      ),
    },
  ];

  if (model.status_options && model.status_options.length > 0) {
    columns.push({
      id: "status",
      header: "Statut",
      cell: ({ row }) =>
        row.original.status ? (
          <Badge variant="secondary">{row.original.status}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    });
  }

  const listFields = [...model.field_definitions]
    .filter((field) => field.show_in_list)
    .sort((a, b) => a.position - b.position);

  for (const field of listFields) {
    columns.push({
      id: field.key,
      header: field.label,
      cell: ({ row }) => (
        <FieldValueView
          field={field}
          value={row.original.data[field.key]}
          recordId={row.original.id}
          organizationId={organizationId}
          accessToken={accessToken}
          currencyCode={currencyCode}
          compact
        />
      ),
    });
  }

  columns.push({
    id: "updated_at",
    header: "Mise à jour",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.original.updated_at)}</span>
    ),
  });

  return columns;
}
