"use client";

/**
 * Redirection générique vers la fiche détail d'un enregistrement dont on ne
 * connaît que l'identifiant (typiquement un champ "Lien vers une fiche" —
 * voir `components/fiches/field-value.tsx:RecordLinkValue`). La route détail
 * réelle est `/models/{modelId}/records/{recordId}` mais un champ de lien ne
 * connaît pas le modèle cible ; cette page le découvre via `GET
 * .../records/{id}` (qui n'exige pas de modèle) puis redirige.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";

import { EmptyState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { SplashScreen } from "@/components/brand/splash-screen";
import { ApiError } from "@/lib/api/errors";
import { getRecord } from "@/lib/api/records";
import { useAuth } from "@/lib/auth/auth-context";

export default function RecordRedirectPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const router = useRouter();
  const { accessToken, currentOrganizationId } = useAuth();

  const query = useQuery({
    queryKey: ["record-redirect", currentOrganizationId, recordId],
    queryFn: () => getRecord(accessToken as string, currentOrganizationId as string, recordId),
    enabled: Boolean(accessToken && currentOrganizationId && recordId),
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      router.replace(`/models/${query.data.model_definition_id}/records/${query.data.id}`);
    }
  }, [query.data, router]);

  if (query.isError) {
    return (
      <EmptyState
        icon={Layers}
        title="Fiche introuvable"
        description={
          query.error instanceof ApiError ? query.error.message : "Cette fiche n'existe pas ou n'est plus accessible."
        }
        action={
          <Button variant="outline" asChild>
            <Link href="/models">Retour à mes modèles</Link>
          </Button>
        }
      />
    );
  }

  return <SplashScreen />;
}
