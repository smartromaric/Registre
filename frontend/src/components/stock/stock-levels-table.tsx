"use client";

/**
 * Matrice variante × dépôt — la vue centrale du panneau Stock (cahier des
 * charges §7.2, §7.4, §7.7) : une cellule par (variante, dépôt), signalée dès
 * qu'elle passe sous son seuil effectif (surcharge dépôt sinon seuil global).
 * C'est ce tableau qui fait la différence entre « il me reste 57 chemises » et
 * « je ne peux plus équiper un agent en L » — la rupture se lit variante par
 * variante, pas seulement au total de l'article (§7.7).
 */

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { TriangleAlert, Warehouse } from "lucide-react";

import { VariantThresholdDialog } from "@/components/stock/variant-threshold-dialog";
import { EmptyState, ErrorState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listStockLevels, listVariantThresholds } from "@/lib/api/stock";
import type { ArticleVariantOut, DepotOut } from "@/lib/api/types";
import { effectiveThreshold, isBelowThreshold, variantLabel } from "@/lib/stock-format";
import { cn } from "@/lib/utils";

export interface StockLevelsTableProps {
  variants: ArticleVariantOut[];
  depots: DepotOut[];
  organizationId: string;
  accessToken: string;
  /** Appelé après un changement de seuil — au parent d'invalider ce qu'il faut. */
  onChanged: () => void;
}

export function StockLevelsTable({ variants, depots, organizationId, accessToken, onChanged }: StockLevelsTableProps) {
  const levelsQueries = useQueries({
    queries: variants.map((variant) => ({
      queryKey: ["stock-levels", organizationId, "variant", variant.id],
      queryFn: () => listStockLevels(accessToken, organizationId, { variantId: variant.id }),
      enabled: depots.length > 0,
    })),
  });
  const thresholdQueries = useQueries({
    queries: variants.map((variant) => ({
      queryKey: ["variant-thresholds", organizationId, variant.id],
      queryFn: () => listVariantThresholds(accessToken, organizationId, variant.id),
      enabled: depots.length > 0,
    })),
  });

  if (depots.length === 0) {
    return (
      <EmptyState
        icon={Warehouse}
        title="Aucun dépôt"
        description="Créez au moins un dépôt pour commencer à suivre le stock de cet article."
        action={
          <Button variant="outline" asChild>
            <Link href="/depots">Créer un dépôt</Link>
          </Button>
        }
      />
    );
  }

  const isLoading = levelsQueries.some((q) => q.isLoading) || thresholdQueries.some((q) => q.isLoading);
  const isError = levelsQueries.some((q) => q.isError) || thresholdQueries.some((q) => q.isError);

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }
  if (isError) {
    return (
      <ErrorState
        message="Impossible de charger les niveaux de stock."
        onRetry={() => {
          for (const q of levelsQueries) void q.refetch();
          for (const q of thresholdQueries) void q.refetch();
        }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Variante</TableHead>
            {depots.map((depot) => (
              <TableHead key={depot.id} className="text-right">
                {depot.name}
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Seuil global</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant, index) => {
            const levels = levelsQueries[index].data ?? [];
            const overrides = thresholdQueries[index].data ?? [];
            const total = levels.reduce((sum, l) => sum + l.quantity, 0);
            const anyBelow = depots.some((depot) => {
              const qty = levels.find((l) => l.depot_id === depot.id)?.quantity ?? 0;
              return isBelowThreshold(qty, effectiveThreshold(variant.default_threshold, depot.id, overrides));
            });
            return (
              <TableRow key={variant.id}>
                <TableCell className="font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    {variantLabel(variant)}
                    {anyBelow ? (
                      <Badge variant="destructive" className="gap-1">
                        <TriangleAlert className="size-3" />
                        Sous seuil
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                {depots.map((depot) => {
                  const qty = levels.find((l) => l.depot_id === depot.id)?.quantity ?? 0;
                  const threshold = effectiveThreshold(variant.default_threshold, depot.id, overrides);
                  const below = isBelowThreshold(qty, threshold);
                  return (
                    <TableCell
                      key={depot.id}
                      className={cn("text-right tabular-nums", below && "font-semibold text-destructive")}
                      title={threshold != null ? `Seuil ${depot.name} : ${threshold}` : undefined}
                    >
                      {qty}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-medium tabular-nums text-foreground">{total}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {variant.default_threshold ?? "—"}
                </TableCell>
                <TableCell>
                  <VariantThresholdDialog
                    variant={variant}
                    depots={depots}
                    organizationId={organizationId}
                    accessToken={accessToken}
                    onSaved={onChanged}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
