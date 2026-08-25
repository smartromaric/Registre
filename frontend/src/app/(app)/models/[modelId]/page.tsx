"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CloudOff, FilePlus2, Layers, Settings } from "lucide-react";

import { buildRecordColumns } from "@/components/fiches/record-columns";
import { ModelIcon } from "@/components/fiches/model-icon";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { getModelDefinition } from "@/lib/api/model-definitions";
import { listRecords } from "@/lib/api/records";
import type { RecordListOut, RecordOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { listCachedRecordsByModel } from "@/lib/offline/db";

const PAGE_SIZE = 50;

/**
 * Vue liste d'un modèle (cahier des charges §5, §14.3) : pagination réellement
 * côté serveur — `listRecords` ne charge jamais que la page courante, avec
 * `total` renvoyé par le backend pour calculer le nombre de pages. Ne monte donc
 * pas en mémoire même avec des dizaines de milliers de fiches.
 */
export default function ModelRecordsPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const router = useRouter();
  const { accessToken, currentOrganizationId, currentOrganization } = useAuth();
  const [pageIndex, setPageIndex] = useState(0);
  const [servedFromCache, setServedFromCache] = useState(false);

  const modelQuery = useQuery({
    queryKey: ["model-definition", currentOrganizationId, modelId],
    queryFn: () => getModelDefinition(accessToken as string, currentOrganizationId as string, modelId),
    enabled: Boolean(accessToken && currentOrganizationId && modelId),
  });

  const recordsQuery = useQuery({
    queryKey: ["records", currentOrganizationId, modelId, pageIndex],
    // Hors-ligne : retombe sur le cache de fiches déjà visitées pour ce
    // modèle — pas de vraie pagination possible sans serveur, on rend tout ce
    // qui est connu localement en une seule page plutôt que de simuler un total.
    queryFn: async (): Promise<RecordListOut> => {
      try {
        const fresh = await listRecords(accessToken as string, currentOrganizationId as string, modelId, {
          limit: PAGE_SIZE,
          offset: pageIndex * PAGE_SIZE,
        });
        setServedFromCache(false);
        return fresh;
      } catch (err) {
        if (err instanceof ApiError && err.kind === "network") {
          const cached = await listCachedRecordsByModel(currentOrganizationId as string, modelId);
          setServedFromCache(true);
          const items = cached.map((c) => c.data);
          return { items, total: items.length, limit: PAGE_SIZE, offset: 0 };
        }
        throw err;
      }
    },
    enabled: Boolean(accessToken && currentOrganizationId && modelId),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo(() => {
    if (!modelQuery.data || !currentOrganizationId || !accessToken) return [];
    return buildRecordColumns({
      model: modelQuery.data,
      organizationId: currentOrganizationId,
      accessToken,
      currencyCode: currentOrganization?.currency_code,
    });
  }, [modelQuery.data, currentOrganizationId, accessToken, currentOrganization?.currency_code]);

  if (modelQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (modelQuery.isError || !modelQuery.data) {
    return (
      <EmptyState
        icon={Layers}
        title="Modèle introuvable"
        description={
          modelQuery.error instanceof ApiError
            ? modelQuery.error.message
            : "Ce modèle n'existe pas ou n'est plus accessible."
        }
        action={
          <Button variant="outline" asChild>
            <Link href="/models">Retour à mes modèles</Link>
          </Button>
        }
      />
    );
  }

  const model = modelQuery.data;

  return (
    <div className="space-y-6">
      {servedFromCache ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/15 px-4 py-2.5 text-sm text-gold-foreground">
          <CloudOff className="size-4 shrink-0" />
          Hors-ligne — dernières données connues.
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ModelIcon icon={model.icon} color={model.color} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                {model.name_plural}
              </h1>
              <Badge variant="outline">{model.nature === "asset" ? "Actif suivi" : "Article de stock"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {model.field_definitions.length} champ{model.field_definitions.length > 1 ? "s" : ""} configuré
              {model.field_definitions.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Réglages du modèle" asChild>
            <Link href={`/models/${model.id}/settings`}>
              <Settings className="size-4" />
            </Link>
          </Button>
          <Button onClick={() => router.push(`/models/${model.id}/records/new`)}>
            <FilePlus2 className="size-4" />
            Nouvelle fiche
          </Button>
        </div>
      </div>

      <DataTable<RecordOut>
        columns={columns}
        data={recordsQuery.data?.items ?? []}
        getRowId={(row) => row.id}
        isLoading={recordsQuery.isFetching}
        error={
          recordsQuery.isError
            ? recordsQuery.error instanceof ApiError
              ? recordsQuery.error.message
              : "Erreur inconnue."
            : null
        }
        onRetry={() => void recordsQuery.refetch()}
        pagination={{ pageIndex, pageSize: PAGE_SIZE, total: recordsQuery.data?.total ?? 0 }}
        onPageChange={setPageIndex}
        onRowClick={(row) => router.push(`/models/${model.id}/records/${row.id}`)}
        caption={
          recordsQuery.data ? `${recordsQuery.data.total} fiche${recordsQuery.data.total !== 1 ? "s" : ""}` : undefined
        }
        emptyState={
          <EmptyState
            icon={FilePlus2}
            title="Aucune fiche pour l'instant"
            description={`Créez la première fiche ${model.name_singular.toLowerCase()} de votre organisation.`}
            action={
              <Button onClick={() => router.push(`/models/${model.id}/records/new`)}>
                Nouvelle fiche
              </Button>
            }
            className="border-none bg-transparent px-6 py-16"
          />
        }
      />
    </div>
  );
}
