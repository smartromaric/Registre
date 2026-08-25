"use client";

/** Ajoute une variante à un article de stock déjà configuré (cahier des
 * charges §7.1) — `POST .../records/{id}/variants`, distinct de la
 * configuration initiale (`ArticleSetupForm`). */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

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
import { ApiError } from "@/lib/api/errors";
import { addVariant } from "@/lib/api/stock";
import type { ArticleVariantOut } from "@/lib/api/types";

export interface AddVariantDialogProps {
  recordId: string;
  organizationId: string;
  accessToken: string;
  /** Libellés d'attributs de l'article (0, 1 ou 2) — voir `ArticleConfigOut.variant_attribute_labels`. */
  attributeLabels: string[];
  onAdded: (variant: ArticleVariantOut) => void;
}

export function AddVariantDialog({
  recordId,
  organizationId,
  accessToken,
  attributeLabels,
  onAdded,
}: AddVariantDialogProps) {
  const [open, setOpen] = useState(false);
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("");
  const [label, setLabel] = useState("");
  const [threshold, setThreshold] = useState("");

  function reset() {
    setValue1("");
    setValue2("");
    setLabel("");
    setThreshold("");
  }

  const mutation = useMutation({
    mutationFn: () => {
      const attributes: Record<string, string> | null = attributeLabels.length > 0 ? {} : null;
      if (attributes && attributeLabels[0]) attributes[attributeLabels[0]] = value1.trim();
      if (attributes && attributeLabels[1]) attributes[attributeLabels[1]] = value2.trim();
      return addVariant(accessToken, organizationId, recordId, {
        attributes,
        label: label.trim() || null,
        default_threshold: threshold.trim() ? Number(threshold) : null,
      });
    },
    onSuccess: (variant) => {
      toast.success("Variante ajoutée.");
      onAdded(variant);
      setOpen(false);
      reset();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Ajout de la variante impossible."),
  });

  const canSubmit =
    attributeLabels.length === 0 || (value1.trim() !== "" && (attributeLabels.length < 2 || value2.trim() !== ""));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="size-3.5" />
          Ajouter une variante
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajouter une variante</DialogTitle>
          <DialogDescription>Elle aura son propre stock et son propre seuil, par dépôt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {attributeLabels[0] ? (
            <FormField id="variant-new-value1" label={attributeLabels[0]}>
              <Input id="variant-new-value1" value={value1} onChange={(e) => setValue1(e.target.value)} />
            </FormField>
          ) : null}
          {attributeLabels[1] ? (
            <FormField id="variant-new-value2" label={attributeLabels[1]}>
              <Input id="variant-new-value2" value={value2} onChange={(e) => setValue2(e.target.value)} />
            </FormField>
          ) : null}
          <FormField id="variant-new-label" label="Libellé" hint="Facultatif — sinon déduit des attributs.">
            <Input id="variant-new-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>
          <FormField id="variant-new-threshold" label="Seuil d'alerte" hint="Facultatif">
            <Input
              id="variant-new-threshold"
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
