"use client";

/**
 * Création/modification d'une offre du catalogue (cahier des charges §12.1,
 * §13) — nom, durée, quotas, prix par devise, mise en avant, activation. Un
 * seul dialogue pour les deux modes, comme `DepotFormDialog`.
 *
 * Les prix par devise (`OfferOut.prices`) ne sont volontairement pas portés
 * par le schéma Zod du formulaire : le jeu de devises actives est dynamique
 * (§12.2 — géré par l'éditeur lui-même) et exiger une valeur pour chacune
 * bloquerait la création d'une offre tant que toutes les devises n'ont pas de
 * prix. Un état local `Record<code, texte saisi>` les tient à part ; seules
 * les valeurs non vides et positives sont envoyées.
 */

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm, useWatch, type DefaultValues } from "react-hook-form";
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
import { createOffer, updateOffer } from "@/lib/api/editor";
import type { CurrencyOut, OfferOut } from "@/lib/api/types";

const offerSchema = z
  .object({
    name: z.string().min(1, "Le nom est obligatoire.").max(80, "80 caractères maximum."),
    duration_months: z.number({ message: "Durée requise." }).int("Nombre entier de mois.").gt(0, "La durée doit être positive."),
    storage_quota_gb: z.number({ message: "Quota requis." }).int("Nombre entier de Go.").gt(0, "Le quota doit être positif."),
    unlimited_users: z.boolean(),
    // Texte brut, pas un nombre : le champ est optionnel selon
    // `unlimited_users`, validé à la main ci-dessous plutôt que par le schéma
    // de champ (même motif que "" → NaN qui justifie `setValueAs` sur les
    // autres champs numériques de ce formulaire).
    user_quota: z.string(),
    is_active: z.boolean(),
    is_featured: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.unlimited_users) return;
    const n = Number(v.user_quota);
    if (v.user_quota.trim() === "" || !Number.isInteger(n) || n <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["user_quota"],
        message: "Indiquez un nombre d'utilisateurs entier positif, ou cochez « illimité ».",
      });
    }
  });
type OfferValues = z.infer<typeof offerSchema>;

export interface OfferFormDialogProps {
  accessToken: string;
  currencies: CurrencyOut[];
  trigger: ReactNode;
  initialValue?: OfferOut;
  onSaved: (offer: OfferOut) => void;
}

export function OfferFormDialog({ accessToken, currencies, trigger, initialValue, onSaved }: OfferFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>(() => pricesToStrings(initialValue?.prices));

  const form = useForm<OfferValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: defaultValues(initialValue),
  });
  const { control, register, handleSubmit, formState } = form;
  const unlimitedUsers = useWatch({ control, name: "unlimited_users" });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset(defaultValues(initialValue));
      setPrices(pricesToStrings(initialValue?.prices));
    }
  }

  const mutation = useMutation({
    mutationFn: (values: OfferValues) => {
      const payload = {
        name: values.name.trim(),
        duration_months: values.duration_months,
        storage_quota_gb: values.storage_quota_gb,
        user_quota: values.unlimited_users ? null : Number(values.user_quota),
        prices: parsePrices(prices),
        is_active: values.is_active,
        is_featured: values.is_featured,
      };
      return initialValue ? updateOffer(accessToken, initialValue.id, payload) : createOffer(accessToken, payload);
    },
    onSuccess: (offer) => {
      toast.success(initialValue ? "Offre mise à jour." : "Offre créée.");
      onSaved(offer);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Enregistrement de l'offre impossible.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialValue ? "Modifier l'offre" : "Nouvelle offre"}</DialogTitle>
          <DialogDescription>
            Durée, stockage et utilisateurs sont les seuls volumes qui distinguent les offres — toutes les
            fonctionnalités restent ouvertes (§12.1).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <FormField id="offer-name" label="Nom" error={formState.errors.name?.message}>
            <Input id="offer-name" placeholder="Ex. Semestrielle" {...register("name")} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="offer-duration" label="Durée (mois)" error={formState.errors.duration_months?.message}>
              <Input
                id="offer-duration"
                type="number"
                min="1"
                step="1"
                {...register("duration_months", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
              />
            </FormField>
            <FormField id="offer-storage" label="Stockage (Go)" error={formState.errors.storage_quota_gb?.message}>
              <Input
                id="offer-storage"
                type="number"
                min="1"
                step="1"
                {...register("storage_quota_gb", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
              />
            </FormField>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">Utilisateurs illimités</span>
              <Controller
                control={control}
                name="unlimited_users"
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
            </label>
            {!unlimitedUsers ? (
              <FormField id="offer-user-quota" label="Nombre d'utilisateurs" error={formState.errors.user_quota?.message}>
                <Input id="offer-user-quota" type="number" min="1" step="1" {...register("user_quota")} />
              </FormField>
            ) : null}
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">Prix par devise</p>
            <p className="text-xs text-muted-foreground">Laissez vide les devises non proposées pour cette offre.</p>
            {currencies.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune devise active — créez-en une d&apos;abord.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {currencies.map((currency) => (
                  <div key={currency.code} className="space-y-1">
                    <label htmlFor={`offer-price-${currency.code}`} className="text-xs text-muted-foreground">
                      {currency.code}
                    </label>
                    <Input
                      id={`offer-price-${currency.code}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={prices[currency.code] ?? ""}
                      onChange={(e) => setPrices((prev) => ({ ...prev, [currency.code]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border p-3">
              <span className="text-sm font-medium text-foreground">Active</span>
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
            </label>
            <label className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border p-3">
              <span className="text-sm font-medium text-foreground">Mise en avant</span>
              <Controller
                control={control}
                name="is_featured"
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {initialValue ? "Enregistrer" : "Créer l'offre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** `duration_months`/`storage_quota_gb` volontairement laissés `undefined` pour
 * une nouvelle offre — une saisie explicite plutôt qu'un volume par défaut
 * inventé (même choix que `quantity: undefined` dans
 * `components/stock/movement-dialog.tsx`). */
function defaultValues(initialValue?: OfferOut): DefaultValues<OfferValues> {
  return {
    name: initialValue?.name ?? "",
    duration_months: initialValue?.duration_months,
    storage_quota_gb: initialValue?.storage_quota_gb,
    unlimited_users: initialValue ? initialValue.user_quota == null : false,
    user_quota: initialValue?.user_quota != null ? String(initialValue.user_quota) : "",
    is_active: initialValue?.is_active ?? true,
    is_featured: initialValue?.is_featured ?? false,
  };
}

function pricesToStrings(prices?: Record<string, number>): Record<string, string> {
  if (!prices) return {};
  return Object.fromEntries(Object.entries(prices).map(([code, value]) => [code, String(value)]));
}

function parsePrices(prices: Record<string, string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [code, raw] of Object.entries(prices)) {
    const value = Number(raw);
    if (raw.trim() !== "" && !Number.isNaN(value) && value >= 0) result[code] = value;
  }
  return result;
}
