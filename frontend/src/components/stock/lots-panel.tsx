"use client";

/**
 * Vue lots et péremption d'un article (cahier des charges §7.5) — n'est
 * affichée par `ArticleStockView` que si `config.lot_tracking_enabled`. Un lot
 * épuisé disparaît de la liste (`include_empty` reste à `false`, comme le
 * backend le fait déjà par défaut). Les paliers de péremption (J-30, J-7,
 * jour J) reprennent ceux du §8.1 pour ne pas inventer une deuxième règle de
 * couleur pour la même notion.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listStockLots } from "@/lib/api/stock";
import type { ArticleVariantOut, DepotOut, StockLotOut } from "@/lib/api/types";
import { computeDueDateStatus, DUE_DATE_TONE_CLASSES } from "@/lib/due-date-status";
import { formatDate } from "@/lib/format";
import { variantLabel } from "@/lib/stock-format";
import { cn } from "@/lib/utils";

const LOT_EXPIRY_OFFSETS = [30, 7, 0];

export interface LotsPanelProps {
  organizationId: string;
  accessToken: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
}

export function LotsPanel({ organizationId, accessToken, variants, depots }: LotsPanelProps) {
  const lotQueries = useQueries({
    queries: variants.map((variant) => ({
      queryKey: ["stock-lots", organizationId, "variant", variant.id],
      queryFn: () => listStockLots(accessToken, organizationId, { variantId: variant.id }),
    })),
  });

  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const depotById = useMemo(() => new Map(depots.map((d) => [d.id, d])), [depots]);

  const isLoading = lotQueries.some((q) => q.isLoading);
  const isError = lotQueries.some((q) => q.isError);

  const lots = useMemo(() => {
    const all: StockLotOut[] = lotQueries.flatMap((q) => q.data ?? []);
    return [...all].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  }, [lotQueries]);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-heading text-base font-medium text-foreground">Lots et péremption</h3>
        <p className="text-sm text-muted-foreground">Les sorties consomment automatiquement le lot le plus ancien.</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : isError ? (
        <ErrorState
          message="Impossible de charger les lots."
          onRetry={() => {
            for (const q of lotQueries) void q.refetch();
          }}
        />
      ) : lots.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Aucun lot en stock"
          description="Les lots apparaîtront ici dès la première entrée avec numéro de lot et date de péremption."
          className="border-none bg-transparent px-6 py-8"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Variante</TableHead>
                <TableHead>Dépôt</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead className="text-right">Quantité restante</TableHead>
                <TableHead>Péremption</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((lot) => {
                const status = computeDueDateStatus(lot.expiry_date, LOT_EXPIRY_OFFSETS);
                return (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium text-foreground">
                      {variantById.get(lot.variant_id) ? variantLabel(variantById.get(lot.variant_id)!) : "—"}
                    </TableCell>
                    <TableCell>{depotById.get(lot.depot_id)?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{lot.lot_number}</TableCell>
                    <TableCell className="text-right tabular-nums">{lot.remaining_quantity}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            DUE_DATE_TONE_CLASSES[status.tone],
                          )}
                        >
                          {status.label}
                        </span>
                        <span className="text-sm text-muted-foreground">{formatDate(lot.expiry_date)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
