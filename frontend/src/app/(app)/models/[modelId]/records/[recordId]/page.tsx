"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArrowLeft, CloudOff, Layers, Loader2, Pencil } from "lucide-react";

import { FieldValueView } from "@/components/fiches/field-value";
import { ModelIcon } from "@/components/fiches/model-icon";
import { getRecordTitle } from "@/components/fiches/record-title";
import { RecordEventsPanel } from "@/components/fiches/record-events-panel";
import { StockPanel } from "@/components/stock/stock-panel";
import { EmptyState } from "@/components/state-views";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { getModelDefinition } from "@/lib/api/model-definitions";
import { archiveRecord, getRecord } from "@/lib/api/records";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth/auth-context";
import { getCachedRecord, putCachedRecord } from "@/lib/offline/db";

export default function RecordDetailPage() {
  const { modelId, recordId } = useParams<{ modelId: string; recordId: string }>();
  const { accessToken, currentOrganizationId, currentOrganization } = useAuth();
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [servedFromCache, setServedFromCache] = useState(false);

  const modelQuery = useQuery({
    queryKey: ["model-definition", currentOrganizationId, modelId],
    queryFn: () => getModelDefinition(accessToken as string, currentOrganizationId as string, modelId),
    enabled: Boolean(accessToken && currentOrganizationId && modelId),
  });

  const recordQueryKey = ["record", currentOrganizationId, recordId];
  const recordQuery = useQuery({
    queryKey: recordQueryKey,
    // Hors-ligne (réseau injoignable, pas une 404/403) : retombe sur le
    // dernier instantané connu plutôt qu'un écran d'erreur — voir
    // `lib/offline/db.ts`. Une fiche jamais visitée en ligne reste, elle,
    // honnêtement indisponible.
    queryFn: async () => {
      try {
        const fresh = await getRecord(accessToken as string, currentOrganizationId as string, recordId);
        setServedFromCache(false);
        void putCachedRecord({
          id: fresh.id,
          organizationId: currentOrganizationId as string,
          modelId: fresh.model_definition_id,
          data: fresh,
          cachedAt: new Date().toISOString(),
        });
        return fresh;
      } catch (err) {
        if (err instanceof ApiError && err.kind === "network") {
          const cached = await getCachedRecord(recordId);
          if (cached) {
            setServedFromCache(true);
            return cached.data;
          }
        }
        throw err;
      }
    },
    enabled: Boolean(accessToken && currentOrganizationId && recordId),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveRecord(accessToken as string, currentOrganizationId as string, recordId),
    onSuccess: (record) => {
      queryClient.setQueryData(recordQueryKey, record);
      toast.success("Fiche archivée.");
      setArchiveOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Archivage impossible.");
    },
  });

  if (modelQuery.isLoading || recordQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (modelQuery.isError || recordQuery.isError || !modelQuery.data || !recordQuery.data) {
    const error = modelQuery.error ?? recordQuery.error;
    return (
      <EmptyState
        icon={Layers}
        title="Fiche introuvable"
        description={error instanceof ApiError ? error.message : "Cette fiche n'existe pas ou n'est plus accessible."}
        action={
          <Button variant="outline" asChild>
            <Link href={`/models/${modelId}`}>Retour à la liste</Link>
          </Button>
        }
      />
    );
  }

  const model = modelQuery.data;
  const record = recordQuery.data;
  const sortedFields = [...model.field_definitions].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-8">
      {servedFromCache ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/15 px-4 py-2.5 text-sm text-gold-foreground">
          <CloudOff className="size-4 shrink-0" />
          Hors-ligne — dernières données connues.
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ModelIcon icon={model.icon} color={model.color} size="lg" />
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 h-6" asChild>
              <Link href={`/models/${model.id}`}>
                <ArrowLeft className="size-3.5" />
                {model.name_plural}
              </Link>
            </Button>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                {getRecordTitle(record, model)}
              </h1>
              {record.status ? <Badge variant="secondary">{record.status}</Badge> : null}
              {record.is_archived ? <Badge variant="outline">Archivée</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Créée le {formatDate(record.created_at)} · mise à jour le {formatDate(record.updated_at)}
              {record.site ? ` · ${record.site}` : ""}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/models/${model.id}/records/${record.id}/edit`}>
              <Pencil className="size-4" />
              Modifier
            </Link>
          </Button>
          {!record.is_archived ? (
            <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Archive className="size-4" />
                  Archiver
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archiver cette fiche ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    « {getRecordTitle(record, model)} » ne sera plus listée par défaut mais restera consultable et
                    exportable. Cette action est réversible côté données (aucune suppression).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={archiveMutation.isPending}>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate()}
                  >
                    {archiveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Archiver
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium text-foreground">Détails</h2>
        <div className="grid gap-x-6 gap-y-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
          {sortedFields.map((field) => (
            <div key={field.id}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{field.label}</p>
              <div className="mt-1 text-sm text-foreground">
                <FieldValueView
                  field={field}
                  value={record.data[field.key]}
                  recordId={record.id}
                  organizationId={currentOrganizationId ?? undefined}
                  accessToken={accessToken ?? undefined}
                  currencyCode={currentOrganization?.currency_code}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {model.nature === "stock_item" ? (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-medium text-foreground">Stock</h2>
          <StockPanel
            recordId={record.id}
            organizationId={currentOrganizationId as string}
            accessToken={accessToken as string}
            currencyCode={currentOrganization?.currency_code}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium text-foreground">Événements</h2>
        <RecordEventsPanel
          organizationId={currentOrganizationId as string}
          accessToken={accessToken as string}
          recordId={record.id}
          currencyCode={currentOrganization?.currency_code}
        />
      </section>
    </div>
  );
}
