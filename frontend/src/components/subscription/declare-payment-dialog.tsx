"use client";

/**
 * « J'ai payé » (cahier des charges §12.4) : l'administrateur de l'organisation
 * déclare un règlement effectué hors plateforme (Mobile Money, virement,
 * espèces) — montant et référence de son côté seulement. La vérification et
 * l'enregistrement du montant réellement reçu reviennent à l'éditeur
 * (`PaymentValidate`, espace éditeur) : ce formulaire ne demande donc jamais
 * ni devise ni moyen de paiement, ce sont des champs de validation, pas de
 * déclaration.
 */

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api/errors";
import { declarePayment } from "@/lib/api/subscriptions";
import type { CurrencyOut, OfferOut, PaymentOut } from "@/lib/api/types";
import { formatWithCurrencyFormat } from "@/lib/format";

const declareSchema = z.object({
  offer_id: z.string().min(1, "Choisissez une offre."),
  declared_amount: z.number({ message: "Montant requis." }).gt(0, "Le montant doit être supérieur à zéro."),
  declared_reference: z.string().min(1, "La référence est obligatoire.").max(120, "120 caractères maximum."),
});
type DeclareValues = z.infer<typeof declareSchema>;

export interface DeclarePaymentDialogProps {
  organizationId: string;
  accessToken: string;
  offers: OfferOut[];
  /** Devise de l'organisation (§12.2) — sert à préremplir le prix affiché et
   * le montant déclaré. `undefined` si le catalogue des devises n'a pas
   * encore chargé ou ne contient pas le code de l'organisation. */
  currency?: CurrencyOut;
  trigger: ReactNode;
  onDeclared: (payment: PaymentOut) => void;
}

export function DeclarePaymentDialog({
  organizationId,
  accessToken,
  offers,
  currency,
  trigger,
  onDeclared,
}: DeclarePaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<DeclareValues>({
    resolver: zodResolver(declareSchema),
    defaultValues: { offer_id: "", declared_amount: undefined, declared_reference: "" },
  });
  const { control, register, handleSubmit, setValue, formState } = form;
  const selectedOfferId = useWatch({ control, name: "offer_id" });
  const selectedOffer = offers.find((o) => o.id === selectedOfferId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) form.reset({ offer_id: "", declared_amount: undefined, declared_reference: "" });
  }

  function selectOffer(offerId: string) {
    setValue("offer_id", offerId, { shouldValidate: true });
    const offer = offers.find((o) => o.id === offerId);
    const price = offer && currency ? offer.prices[currency.code] : undefined;
    if (price != null) setValue("declared_amount", price, { shouldValidate: true });
  }

  const mutation = useMutation({
    mutationFn: (values: DeclareValues) =>
      declarePayment(accessToken, organizationId, {
        offer_id: values.offer_id,
        declared_amount: values.declared_amount,
        declared_reference: values.declared_reference.trim(),
      }),
    onSuccess: (payment) => {
      toast.success("Paiement déclaré. Il apparaît désormais « Déclaré » jusqu'à vérification par l'éditeur.");
      onDeclared(payment);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Déclaration du paiement impossible.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Déclarer un paiement</DialogTitle>
          <DialogDescription>
            Réglez hors plateforme (Mobile Money, virement, espèces) auprès de l&apos;éditeur, puis indiquez ici la
            référence de la transaction. L&apos;éditeur vérifie et valide le règlement (§12.4) — l&apos;abonnement est
            prolongé dès validation, sans perte de jours.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
          <FormField id="declare-offer" label="Offre" error={formState.errors.offer_id?.message}>
            <Select value={selectedOfferId} onValueChange={selectOffer}>
              <SelectTrigger id="declare-offer" className="w-full">
                <SelectValue placeholder="Choisir une offre" />
              </SelectTrigger>
              <SelectContent>
                {offers.map((offer) => (
                  <SelectItem key={offer.id} value={offer.id}>
                    {offer.name}
                    {currency && offer.prices[currency.code] != null
                      ? ` — ${formatWithCurrencyFormat(offer.prices[currency.code], currency)}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOffer ? (
              <p className="text-xs text-muted-foreground">
                {selectedOffer.duration_months} mois · {selectedOffer.storage_quota_gb} Go ·{" "}
                {selectedOffer.user_quota ? `${selectedOffer.user_quota} utilisateurs` : "utilisateurs illimités"}
              </p>
            ) : null}
          </FormField>

          <FormField id="declare-amount" label="Montant réglé" error={formState.errors.declared_amount?.message}>
            <Input
              id="declare-amount"
              type="number"
              step="0.01"
              min="0"
              {...register("declared_amount", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            />
          </FormField>

          <FormField
            id="declare-reference"
            label="Référence de la transaction"
            hint="Numéro de transaction Mobile Money, référence de virement…"
            error={formState.errors.declared_reference?.message}
          >
            <Input id="declare-reference" placeholder="Ex. MTN-8842217" {...register("declared_reference")} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              J&apos;ai payé
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
