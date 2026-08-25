"use client";

/**
 * Point d'entrée du module Stock sur une fiche (cahier des charges §7) —
 * inclus par la page détail d'une fiche (`app/(app)/models/[modelId]/records/[recordId]/page.tsx`)
 * quand `model.nature === "stock_item"`. Un article de stock reste une fiche
 * comme une autre (champs personnalisés affichés dans la section "Détails" au
 * même endroit que pour un actif suivi) ; ce panneau n'ajoute que les données
 * propres au stock, qui vivent dans des tables séparées de `Record.data`.
 *
 * `GET .../records/{id}/article` répond 404 tant que l'article n'a pas encore
 * été configuré une première fois (fiche tout juste créée, ou modèle `stock_item`
 * créé à la main plutôt que depuis un gabarit) — c'est un état normal, pas une
 * erreur, donc pas de retry ni d'`ErrorState` dans ce cas précis.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ArticleSetupForm } from "@/components/stock/article-setup-form";
import { ArticleStockView } from "@/components/stock/article-stock-view";
import { ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { getArticle } from "@/lib/api/stock";

export interface StockPanelProps {
  recordId: string;
  organizationId: string;
  accessToken: string;
  currencyCode?: string;
}

export function StockPanel({ recordId, organizationId, accessToken, currencyCode }: StockPanelProps) {
  const queryClient = useQueryClient();
  const queryKey = ["article", organizationId, recordId];

  const articleQuery = useQuery({
    queryKey,
    queryFn: () => getArticle(accessToken, organizationId, recordId),
    retry: false,
  });

  if (articleQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (articleQuery.isError) {
    if (articleQuery.error instanceof ApiError && articleQuery.error.status === 404) {
      return (
        <ArticleSetupForm
          recordId={recordId}
          organizationId={organizationId}
          accessToken={accessToken}
          onConfigured={(article) => queryClient.setQueryData(queryKey, article)}
        />
      );
    }
    return (
      <ErrorState
        message={articleQuery.error instanceof ApiError ? articleQuery.error.message : "Erreur inconnue."}
        onRetry={() => void articleQuery.refetch()}
      />
    );
  }

  if (!articleQuery.data) return null;

  return (
    <ArticleStockView
      recordId={recordId}
      organizationId={organizationId}
      accessToken={accessToken}
      article={articleQuery.data}
      currencyCode={currencyCode}
      onArticleRefresh={() => void articleQuery.refetch()}
    />
  );
}
