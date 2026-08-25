"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers } from "lucide-react";

import { RecordForm } from "@/components/fiches/record-form";
import { EmptyState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { getModelDefinition } from "@/lib/api/model-definitions";
import { useAuth } from "@/lib/auth/auth-context";

export default function NewRecordPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const router = useRouter();
  const { accessToken, currentOrganizationId } = useAuth();

  const modelQuery = useQuery({
    queryKey: ["model-definition", currentOrganizationId, modelId],
    queryFn: () => getModelDefinition(accessToken as string, currentOrganizationId as string, modelId),
    enabled: Boolean(accessToken && currentOrganizationId && modelId),
  });

  if (modelQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (modelQuery.isError || !modelQuery.data) {
    return (
      <EmptyState
        icon={Layers}
        title="Modèle introuvable"
        description={modelQuery.error instanceof ApiError ? modelQuery.error.message : undefined}
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
    <div className="max-w-3xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={`/models/${model.id}`}>
            <ArrowLeft className="size-3.5" />
            {model.name_plural}
          </Link>
        </Button>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          Nouvelle fiche — {model.name_singular}
        </h1>
      </div>

      <RecordForm
        model={model}
        organizationId={currentOrganizationId as string}
        accessToken={accessToken as string}
        mode="create"
        onSuccess={(record) => router.push(`/models/${model.id}/records/${record.id}`)}
      />
    </div>
  );
}
