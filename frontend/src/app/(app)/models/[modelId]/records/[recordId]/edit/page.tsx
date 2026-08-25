"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers } from "lucide-react";

import { RecordForm } from "@/components/fiches/record-form";
import { getRecordTitle } from "@/components/fiches/record-title";
import { EmptyState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { getModelDefinition } from "@/lib/api/model-definitions";
import { getRecord } from "@/lib/api/records";
import { useAuth } from "@/lib/auth/auth-context";

export default function EditRecordPage() {
  const { modelId, recordId } = useParams<{ modelId: string; recordId: string }>();
  const router = useRouter();
  const { accessToken, currentOrganizationId } = useAuth();

  const modelQuery = useQuery({
    queryKey: ["model-definition", currentOrganizationId, modelId],
    queryFn: () => getModelDefinition(accessToken as string, currentOrganizationId as string, modelId),
    enabled: Boolean(accessToken && currentOrganizationId && modelId),
  });

  const recordQuery = useQuery({
    queryKey: ["record", currentOrganizationId, recordId],
    queryFn: () => getRecord(accessToken as string, currentOrganizationId as string, recordId),
    enabled: Boolean(accessToken && currentOrganizationId && recordId),
  });

  if (modelQuery.isLoading || recordQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (modelQuery.isError || recordQuery.isError || !modelQuery.data || !recordQuery.data) {
    const error = modelQuery.error ?? recordQuery.error;
    return (
      <EmptyState
        icon={Layers}
        title="Fiche introuvable"
        description={error instanceof ApiError ? error.message : undefined}
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

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={`/models/${model.id}/records/${record.id}`}>
            <ArrowLeft className="size-3.5" />
            {getRecordTitle(record, model)}
          </Link>
        </Button>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          Modifier — {getRecordTitle(record, model)}
        </h1>
      </div>

      <RecordForm
        model={model}
        organizationId={currentOrganizationId as string}
        accessToken={accessToken as string}
        mode="edit"
        record={record}
        onSuccess={(updated) => router.push(`/models/${model.id}/records/${updated.id}`)}
      />
    </div>
  );
}
