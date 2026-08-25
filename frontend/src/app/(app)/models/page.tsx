"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Layers, Library, Plus } from "lucide-react";

import { ModelIcon } from "@/components/fiches/model-icon";
import { EmptyState, ErrorState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { listModelDefinitions } from "@/lib/api/model-definitions";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * "Mes modèles" (cahier des charges §5.1) : les modèles de fiche activés ou créés
 * par l'organisation courante — jamais de modèle inventé, la liste vient
 * exclusivement de `GET /organizations/{id}/model-definitions`.
 */
export default function ModelsPage() {
  const { accessToken, currentOrganizationId } = useAuth();

  const query = useQuery({
    queryKey: ["model-definitions", currentOrganizationId],
    queryFn: () => listModelDefinitions(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Mes modèles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Les modèles de fiche configurés par votre organisation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/models/library">
              <Library className="size-4" />
              Bibliothèque
            </Link>
          </Button>
          <Button asChild>
            <Link href="/models/new">
              <Plus className="size-4" />
              Nouveau modèle
            </Link>
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Erreur inconnue."}
          onRetry={() => void query.refetch()}
        />
      ) : query.data && query.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((model) => (
            <Link key={model.id} href={`/models/${model.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <ModelIcon icon={model.icon} color={model.color} />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">{model.name_plural}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {model.field_definitions.length} champ{model.field_definitions.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </CardHeader>
                <div className="px-(--card-spacing) pb-(--card-spacing)">
                  <Badge variant="outline">{model.nature === "asset" ? "Actif suivi" : "Article de stock"}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Layers}
          title="Aucun modèle pour l'instant"
          description="Activez un modèle prêt à l'emploi depuis la bibliothèque, ou créez le vôtre de toutes pièces."
          action={
            <>
              <Button variant="outline" asChild>
                <Link href="/models/library">Depuis la bibliothèque</Link>
              </Button>
              <Button asChild>
                <Link href="/models/new">Créer un modèle</Link>
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
