"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { ModelIcon } from "@/components/fiches/model-icon";
import { ErrorState } from "@/components/state-views";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { activateTemplate, listTemplates } from "@/lib/api/model-definitions";
import type { TemplateSummary } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Bibliothèque de modèles prêts à l'emploi (cahier des charges §5.6) : six
 * modèles fournis par le backend (`GET /organizations/{id}/templates`). Activer
 * un modèle en fait une copie propre à l'organisation — aucune donnée inventée
 * ici au-delà de ce que le backend renvoie réellement.
 */
export default function TemplateLibraryPage() {
  const { accessToken, currentOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const [pendingTemplate, setPendingTemplate] = useState<TemplateSummary | null>(null);

  const query = useQuery({
    queryKey: ["templates", currentOrganizationId],
    queryFn: () => listTemplates(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
  });

  const activateMutation = useMutation({
    mutationFn: (templateKey: string) =>
      activateTemplate(accessToken as string, currentOrganizationId as string, templateKey),
    onSuccess: async (model) => {
      toast.success(`« ${model.name_plural} » activé.`);
      await queryClient.invalidateQueries({ queryKey: ["model-definitions", currentOrganizationId] });
      setPendingTemplate(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Activation impossible.");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/models">
            <ArrowLeft className="size-3.5" />
            Mes modèles
          </Link>
        </Button>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          Bibliothèque de modèles
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Activez un modèle prêt à l&apos;emploi puis adaptez-le librement — une fois activé, il devient la
          propriété de votre organisation (§5.6).
        </p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Erreur inconnue."}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(query.data ?? []).map((template) => (
            <Card key={template.key} className="flex h-full flex-col justify-between">
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <ModelIcon icon={template.icon} color={template.color} />
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate">{template.name_plural}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {template.field_count} champ{template.field_count > 1 ? "s" : ""} ·{" "}
                    {template.nature === "asset" ? "Actif suivi" : "Article de stock"}
                  </p>
                </div>
              </CardHeader>
              <div className="px-(--card-spacing) pb-(--card-spacing)">
                <Button
                  size="sm"
                  className="w-full"
                  disabled={activateMutation.isPending}
                  onClick={() => setPendingTemplate(template)}
                >
                  {activateMutation.isPending && pendingTemplate?.key === template.key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  Activer
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(pendingTemplate)} onOpenChange={(open) => !open && setPendingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activer « {pendingTemplate?.name_plural} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Une copie de ce modèle sera créée pour votre organisation, avec ses {pendingTemplate?.field_count}{" "}
              champs. Vous pourrez ensuite l&apos;adapter librement (renommer, ajouter des champs...).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activateMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={activateMutation.isPending}
              onClick={() => pendingTemplate && activateMutation.mutate(pendingTemplate.key)}
            >
              {activateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Activer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
