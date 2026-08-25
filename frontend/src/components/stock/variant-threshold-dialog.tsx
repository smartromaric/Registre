"use client";

/**
 * Réglage du seuil d'alerte d'une variante — global et, facultativement,
 * dépôt par dépôt (cahier des charges §7.2 : "réglable globalement et dépôt
 * par dépôt"). Le backend ne permet pas de retirer une surcharge dépôt une
 * fois posée (`PUT .../threshold` accepte une valeur, pas une suppression) —
 * limite assumée, pas contournée ici.
 *
 * Les valeurs affichées ne sont jamais recopiées depuis la requête dans un
 * état local via un effet (anti-pattern React) : seules les valeurs
 * effectivement modifiées par l'utilisateur sont gardées en état
 * (`depotEdits`/`globalEdit`, réinitialisés à l'ouverture) ; à l'affichage,
 * l'édition locale prévaut sur la valeur reçue du serveur, elle-même utilisée
 * telle quelle tant qu'elle n'a pas été touchée.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { listVariantThresholds, setVariantThreshold } from "@/lib/api/stock";
import type { ArticleVariantOut, DepotOut } from "@/lib/api/types";
import { variantLabel } from "@/lib/stock-format";

export interface VariantThresholdDialogProps {
  variant: ArticleVariantOut;
  depots: DepotOut[];
  organizationId: string;
  accessToken: string;
  /** Appelé après un enregistrement réussi — au parent de rafraîchir ses données. */
  onSaved: () => void;
}

export function VariantThresholdDialog({
  variant,
  depots,
  organizationId,
  accessToken,
  onSaved,
}: VariantThresholdDialogProps) {
  const [open, setOpen] = useState(false);
  // `null` = pas encore modifié par l'utilisateur — on affiche alors le seuil
  // global actuel de la variante, jamais une copie figée dans un effet.
  const [globalEdit, setGlobalEdit] = useState<string | null>(null);
  const [depotEdits, setDepotEdits] = useState<Record<string, string>>({});

  const thresholdsQuery = useQuery({
    queryKey: ["variant-thresholds", organizationId, variant.id],
    queryFn: () => listVariantThresholds(accessToken, organizationId, variant.id),
    enabled: open,
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setGlobalEdit(null);
      setDepotEdits({});
    }
  }

  const initialGlobal = variant.default_threshold != null ? String(variant.default_threshold) : "";
  const globalValue = globalEdit ?? initialGlobal;

  const initialDepotMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of thresholdsQuery.data ?? []) map[t.depot_id] = String(t.threshold);
    return map;
  }, [thresholdsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const calls: Promise<void>[] = [];
      if (globalEdit !== null && globalEdit.trim() !== "" && globalEdit !== initialGlobal) {
        calls.push(
          setVariantThreshold(accessToken, organizationId, variant.id, {
            depot_id: null,
            threshold: Number(globalEdit),
          }),
        );
      }
      for (const depot of depots) {
        const edited = depotEdits[depot.id];
        const initial = initialDepotMap[depot.id] ?? "";
        if (edited !== undefined && edited.trim() !== "" && edited !== initial) {
          calls.push(
            setVariantThreshold(accessToken, organizationId, variant.id, {
              depot_id: depot.id,
              threshold: Number(edited),
            }),
          );
        }
      }
      await Promise.all(calls);
    },
    onSuccess: () => {
      toast.success("Seuils mis à jour.");
      onSaved();
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Mise à jour des seuils impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Régler les seuils de ${variantLabel(variant)}`}
        >
          <Settings2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seuils d&apos;alerte — {variantLabel(variant)}</DialogTitle>
          <DialogDescription>
            Le seuil global s&apos;applique à tous les dépôts qui n&apos;ont pas de réglage particulier (§7.2).
          </DialogDescription>
        </DialogHeader>

        <FormField id="threshold-global" label="Seuil global">
          <Input
            id="threshold-global"
            type="number"
            min={0}
            value={globalValue}
            onChange={(e) => setGlobalEdit(e.target.value)}
          />
        </FormField>

        {thresholdsQuery.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : depots.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Par dépôt (facultatif)</p>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {depots.map((depot) => (
                <div key={depot.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm text-foreground">{depot.name}</span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Seuil global"
                    className="w-28"
                    value={depotEdits[depot.id] ?? initialDepotMap[depot.id] ?? ""}
                    onChange={(e) => setDepotEdits((prev) => ({ ...prev, [depot.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
