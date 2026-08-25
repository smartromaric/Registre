"use client";

/**
 * Vue Stock d'un article déjà configuré (cahier des charges §7) : résumé de la
 * configuration, matrice de niveaux par variante/dépôt, saisie de mouvement,
 * historique, et — seulement si pertinent pour cet article — lots/péremption
 * et consignation. Affichée par `StockPanel` une fois `GET .../article` a
 * répondu (pas de 404) ; voir `ArticleSetupForm` pour le cas contraire.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AddVariantDialog } from "@/components/stock/add-variant-dialog";
import { ConsignmentPanel } from "@/components/stock/consignment-panel";
import { LotsPanel } from "@/components/stock/lots-panel";
import { MovementDialog } from "@/components/stock/movement-dialog";
import { MovementHistory } from "@/components/stock/movement-history";
import { StockLevelsTable } from "@/components/stock/stock-levels-table";
import { ErrorState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { listDepots } from "@/lib/api/stock";
import type { ArticleWithVariantsOut } from "@/lib/api/types";
import { formatAmount } from "@/lib/format";

export interface ArticleStockViewProps {
  recordId: string;
  organizationId: string;
  accessToken: string;
  article: ArticleWithVariantsOut;
  currencyCode?: string;
  /** Appelé après l'ajout d'une variante — au parent de relire l'article. */
  onArticleRefresh: () => void;
}

export function ArticleStockView({
  recordId,
  organizationId,
  accessToken,
  article,
  currencyCode,
  onArticleRefresh,
}: ArticleStockViewProps) {
  const { config, variants } = article;
  const queryClient = useQueryClient();

  const depotsQuery = useQuery({
    queryKey: ["depots", organizationId],
    queryFn: () => listDepots(accessToken, organizationId),
  });

  function invalidateStockData() {
    void queryClient.invalidateQueries({ queryKey: ["stock-levels", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["variant-thresholds", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["stock-movements", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["stock-lots", organizationId] });
  }

  if (depotsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (depotsQuery.isError || !depotsQuery.data) {
    return (
      <ErrorState
        message={depotsQuery.error instanceof ApiError ? depotsQuery.error.message : "Impossible de charger les dépôts."}
        onRetry={() => void depotsQuery.refetch()}
      />
    );
  }

  const depots = depotsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {config.unit ? <span>Unité : {config.unit}</span> : null}
            {config.purchase_price != null ? <span>Achat : {formatAmount(config.purchase_price, currencyCode)}</span> : null}
            {config.sale_price != null ? <span>Vente : {formatAmount(config.sale_price, currencyCode)}</span> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">
              {variants.length} variante{variants.length > 1 ? "s" : ""}
            </Badge>
            {config.lot_tracking_enabled ? <Badge variant="outline">Lots suivis</Badge> : null}
            {config.is_consigned ? <Badge variant="outline">Consigné</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddVariantDialog
            recordId={recordId}
            organizationId={organizationId}
            accessToken={accessToken}
            attributeLabels={config.variant_attribute_labels ?? []}
            onAdded={() => {
              onArticleRefresh();
              toast.success("Variante disponible dans la matrice de stock.");
            }}
          />
          <MovementDialog
            recordId={recordId}
            organizationId={organizationId}
            accessToken={accessToken}
            variants={variants}
            depots={depots}
            lotTrackingEnabled={config.lot_tracking_enabled}
            onDone={invalidateStockData}
          />
        </div>
      </div>

      <StockLevelsTable
        variants={variants}
        depots={depots}
        organizationId={organizationId}
        accessToken={accessToken}
        onChanged={invalidateStockData}
      />

      {config.is_consigned ? (
        <ConsignmentPanel
          organizationId={organizationId}
          accessToken={accessToken}
          variants={variants}
          depots={depots}
          currencyCode={currencyCode}
        />
      ) : null}

      {config.lot_tracking_enabled ? (
        <LotsPanel organizationId={organizationId} accessToken={accessToken} variants={variants} depots={depots} />
      ) : null}

      <section className="space-y-2">
        <h3 className="font-heading text-base font-medium text-foreground">Historique des mouvements</h3>
        <MovementHistory
          organizationId={organizationId}
          accessToken={accessToken}
          recordId={recordId}
          variants={variants}
          depots={depots}
        />
      </section>
    </div>
  );
}
