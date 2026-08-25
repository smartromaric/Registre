"use client";

/** Boîte de dialogue de création/modification d'un dépôt (cahier des charges
 * §7.2) — même dialogue pour les deux modes, comme `FieldDefinitionEditorDialog`
 * pour les champs de fiche. */

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";
import { createDepot, updateDepot } from "@/lib/api/stock";
import type { DepotOut } from "@/lib/api/types";

const depotSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire.").max(120, "120 caractères maximum."),
  address: z.string().max(300, "300 caractères maximum.").optional(),
  is_active: z.boolean(),
});
type DepotValues = z.infer<typeof depotSchema>;

export interface DepotFormDialogProps {
  organizationId: string;
  accessToken: string;
  trigger: ReactNode;
  initialValue?: DepotOut;
  onSaved: (depot: DepotOut) => void;
}

export function DepotFormDialog({ organizationId, accessToken, trigger, initialValue, onSaved }: DepotFormDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<DepotValues>({
    resolver: zodResolver(depotSchema),
    defaultValues: {
      name: initialValue?.name ?? "",
      address: initialValue?.address ?? "",
      is_active: initialValue?.is_active ?? true,
    },
  });
  const { control, register, handleSubmit, formState } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({
        name: initialValue?.name ?? "",
        address: initialValue?.address ?? "",
        is_active: initialValue?.is_active ?? true,
      });
    }
  }

  const mutation = useMutation({
    mutationFn: (values: DepotValues) =>
      initialValue
        ? updateDepot(accessToken, organizationId, initialValue.id, {
            name: values.name.trim(),
            address: values.address?.trim() || null,
            is_active: values.is_active,
          })
        : createDepot(accessToken, organizationId, {
            name: values.name.trim(),
            address: values.address?.trim() || null,
          }),
    onSuccess: (depot) => {
      toast.success(initialValue ? "Dépôt mis à jour." : "Dépôt créé.");
      onSaved(depot);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Enregistrement du dépôt impossible.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialValue ? "Modifier le dépôt" : "Nouveau dépôt"}</DialogTitle>
          <DialogDescription>
            Les quantités de stock sont toujours rattachées à un dépôt (§7.2).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
          <FormField id="depot-name" label="Nom" error={formState.errors.name?.message}>
            <Input id="depot-name" placeholder="Ex. Dépôt Douala" {...register("name")} />
          </FormField>
          <FormField id="depot-address" label="Adresse" hint="Facultatif" error={formState.errors.address?.message}>
            <Textarea id="depot-address" rows={2} {...register("address")} />
          </FormField>
          {initialValue ? (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <span>
                <span className="block text-sm font-medium text-foreground">Dépôt actif</span>
                <span className="block text-xs text-muted-foreground">
                  Un dépôt inactif n&apos;apparaît plus dans les formulaires de mouvement.
                </span>
              </span>
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
            </label>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {initialValue ? "Enregistrer" : "Créer le dépôt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
