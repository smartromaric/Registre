"use client";

/**
 * Bouton « Exporter » de la vue liste d'un modèle.
 *
 * La route `records/export.csv` existait côté backend depuis le lot 3 **sans
 * aucun appelant** : la fonction était inatteignable depuis l'application, alors
 * que le cahier des charges §4.2 fait de l'export un droit du rôle Lecteur
 * lui-même. C'est le troisième cas de « backend complet, zéro interface »
 * rencontré sur ce produit, après les alertes et l'import.
 *
 * Deux honnêtetés, plutôt qu'un bouton qui se contente de marcher :
 * - au-delà de `EXPORT_ROW_LIMIT`, le serveur tronque. On le DIT avant, dans le
 *   libellé et dans une confirmation, au lieu de laisser découvrir un fichier
 *   incomplet ;
 * - hors ligne, le bouton est désactivé et le dit. L'export lit le serveur, il
 *   ne peut pas se satisfaire du cache local — qui ne contient que les fiches
 *   déjà visitées.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { EXPORT_ROW_LIMIT, exportRecordsCsv } from "@/lib/api/records";
import { useAuth } from "@/lib/auth/auth-context";

export function ExportRecordsButton({
  modelId,
  totalRecords,
  disabled = false,
  disabledReason,
}: {
  modelId: string;
  /** Total renvoyé par le serveur — sert à prévenir d'une troncature. */
  totalRecords: number | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { accessToken, currentOrganizationId } = useAuth();
  const [pending, setPending] = useState(false);

  const willTruncate = totalRecords !== null && totalRecords > EXPORT_ROW_LIMIT;

  async function run() {
    if (willTruncate) {
      const proceed = window.confirm(
        `Ce modèle compte ${totalRecords?.toLocaleString("fr-FR")} fiches. ` +
          `L'export est plafonné à ${EXPORT_ROW_LIMIT.toLocaleString("fr-FR")} lignes : ` +
          `le fichier sera incomplet.\n\nContinuer quand même ?`,
      );
      if (!proceed) return;
    }

    setPending(true);
    try {
      const file = await exportRecordsCsv(
        accessToken as string,
        currentOrganizationId as string,
        modelId,
      );

      // Le fichier arrive par `fetch` (l'authentification est dans un en-tête) :
      // il faut donc le remettre au navigateur nous-mêmes. L'URL d'objet est
      // révoquée aussitôt, sinon le blob reste en mémoire tant que l'onglet vit.
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`Export téléchargé : ${file.filename}`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "L'export a échoué. Réessayez dans un instant.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={() => void run()}
      disabled={disabled || pending}
      title={disabled ? disabledReason : willTruncate ? `Plafonné à ${EXPORT_ROW_LIMIT} lignes` : undefined}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {pending ? "Export en cours…" : "Exporter"}
    </Button>
  );
}
