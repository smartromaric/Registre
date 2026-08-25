"use client";

/**
 * Historique des mouvements d'un article (cahier des charges §7.3) — pagination
 * réellement côté serveur, comme la liste des fiches (`listMovements` ne charge
 * jamais que la page courante). Un mouvement ne se modifie ni ne se supprime :
 * cette liste n'a donc aucune action, seulement la lecture.
 */

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/state-views";
import { ApiError } from "@/lib/api/errors";
import { listMovements } from "@/lib/api/stock";
import type { ArticleVariantOut, DepotOut, MovementOut } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_TONE_CLASSES, formatQuantityDelta, variantLabel } from "@/lib/stock-format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export interface MovementHistoryProps {
  organizationId: string;
  accessToken: string;
  recordId: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
}

function movementDetail(movement: MovementOut): string {
  const parts = [
    movement.reason,
    movement.supplier ? `fournisseur : ${movement.supplier}` : null,
    movement.beneficiary ? `bénéficiaire : ${movement.beneficiary}` : null,
    movement.lot_number ? `lot ${movement.lot_number}` : null,
    movement.note,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.join(" · ");
}

export function MovementHistory({ organizationId, accessToken, recordId, variants, depots }: MovementHistoryProps) {
  const [pageIndex, setPageIndex] = useState(0);

  const query = useQuery({
    queryKey: ["stock-movements", organizationId, recordId, pageIndex],
    queryFn: () =>
      listMovements(accessToken, organizationId, { recordId, limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const depotById = useMemo(() => new Map(depots.map((d) => [d.id, d])), [depots]);

  const columns = useMemo<ColumnDef<MovementOut, unknown>[]>(
    () => [
      {
        id: "created_at",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "movement_type",
        header: "Type",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
              MOVEMENT_TYPE_TONE_CLASSES[row.original.movement_type],
            )}
          >
            {MOVEMENT_TYPE_LABELS[row.original.movement_type]}
          </span>
        ),
      },
      {
        id: "variant",
        header: "Variante",
        cell: ({ row }) => {
          const variant = variantById.get(row.original.variant_id);
          return <span className="text-sm">{variant ? variantLabel(variant) : "—"}</span>;
        },
      },
      {
        id: "depot",
        header: "Dépôt",
        cell: ({ row }) => <span className="text-sm">{depotById.get(row.original.depot_id)?.name ?? "—"}</span>,
      },
      {
        id: "quantity_delta",
        header: "Quantité",
        cell: ({ row }) => (
          <span
            className={cn(
              "font-medium tabular-nums",
              row.original.quantity_delta > 0
                ? "text-success"
                : row.original.quantity_delta < 0
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {formatQuantityDelta(row.original.quantity_delta)}
          </span>
        ),
      },
      {
        id: "detail",
        header: "Détail",
        cell: ({ row }) => {
          const detail = movementDetail(row.original);
          return detail ? (
            <span className="block max-w-64 truncate text-sm text-muted-foreground" title={detail}>
              {detail}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
    ],
    [variantById, depotById],
  );

  return (
    <DataTable<MovementOut>
      columns={columns}
      data={query.data?.items ?? []}
      getRowId={(row) => row.id}
      isLoading={query.isFetching}
      error={query.isError ? (query.error instanceof ApiError ? query.error.message : "Erreur inconnue.") : null}
      onRetry={() => void query.refetch()}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, total: query.data?.total ?? 0 }}
      onPageChange={setPageIndex}
      caption={query.data ? `${query.data.total} mouvement${query.data.total !== 1 ? "s" : ""}` : undefined}
      emptyState={
        <EmptyState
          icon={History}
          title="Aucun mouvement"
          description="Les entrées, sorties, ajustements et transferts de cet article apparaîtront ici."
          className="border-none bg-transparent px-6 py-10"
        />
      }
    />
  );
}
