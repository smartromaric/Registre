"use client";

/**
 * Création/modification d'une devise acceptée (cahier des charges §12.2,
 * §13). Le code ISO (`CurrencyCreate.code`) n'est pas modifiable une fois
 * créé — `CurrencyUpdate` ne porte que `display_format`/`is_active` côté
 * backend — le champ est donc désactivé en modification plutôt que
 * silencieusement ignoré.
 */

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
import { ApiError } from "@/lib/api/errors";
import { createCurrency, updateCurrency } from "@/lib/api/editor";
import type { CurrencyOut } from "@/lib/api/types";

const currencySchema = z.object({
  code: z
    .string()
    .length(3, "Exactement 3 lettres (ex. XAF).")
    .regex(/^[A-Za-z]{3}$/, "Trois lettres uniquement."),
  display_format: z.string().min(1, "Le format d'affichage est obligatoire.").max(40, "40 caractères maximum."),
  is_active: z.boolean(),
});
type CurrencyValues = z.infer<typeof currencySchema>;

export interface CurrencyFormDialogProps {
  accessToken: string;
  trigger: ReactNode;
  initialValue?: CurrencyOut;
  onSaved: (currency: CurrencyOut) => void;
}

export function CurrencyFormDialog({ accessToken, trigger, initialValue, onSaved }: CurrencyFormDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<CurrencyValues>({
    resolver: zodResolver(currencySchema),
    defaultValues: defaultValues(initialValue),
  });
  const { control, register, handleSubmit, formState } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) form.reset(defaultValues(initialValue));
  }

  const mutation = useMutation({
    mutationFn: (values: CurrencyValues) =>
      initialValue
        ? updateCurrency(accessToken, initialValue.id, {
            display_format: values.display_format.trim(),
            is_active: values.is_active,
          })
        : createCurrency(accessToken, {
            code: values.code.toUpperCase(),
            display_format: values.display_format.trim(),
            is_active: values.is_active,
          }),
    onSuccess: (currency) => {
      toast.success(initialValue ? "Devise mise à jour." : "Devise créée.");
      onSaved(currency);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Enregistrement de la devise impossible.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialValue ? "Modifier la devise" : "Nouvelle devise"}</DialogTitle>
          <DialogDescription>
            Le format d&apos;affichage détermine comment les montants apparaissent dans toute l&apos;application, ex.
            « {"{amount} FCFA"} ».
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
          <FormField id="currency-code" label="Code ISO (3 lettres)" error={formState.errors.code?.message}>
            <Input
              id="currency-code"
              placeholder="Ex. XAF"
              maxLength={3}
              disabled={Boolean(initialValue)}
              className="uppercase"
              {...register("code")}
            />
          </FormField>

          <FormField
            id="currency-format"
            label="Format d'affichage"
            hint={"Utilisez {amount} pour la position du montant."}
            error={formState.errors.display_format?.message}
          >
            <Input id="currency-format" placeholder="Ex. {amount} FCFA" {...register("display_format")} />
          </FormField>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span>
              <span className="block text-sm font-medium text-foreground">Devise active</span>
              <span className="block text-xs text-muted-foreground">
                Une devise inactive n&apos;apparaît plus dans les sélecteurs de prix.
              </span>
            </span>
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {initialValue ? "Enregistrer" : "Créer la devise"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaultValues(initialValue?: CurrencyOut): CurrencyValues {
  return {
    code: initialValue?.code ?? "",
    display_format: initialValue?.display_format ?? "{amount}",
    is_active: initialValue?.is_active ?? true,
  };
}
