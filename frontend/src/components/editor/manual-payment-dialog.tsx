"use client";

/**
 * Enregistrement d'un paiement reçu hors plateforme, sans déclaration
 * préalable (cahier des charges §12.4) — un client qui a réglé par un canal
 * que l'organisation n'a pas utilisé pour « J'ai payé ». Crée directement un
 * paiement validé et sa facture : même degré de conséquence que la
 * validation d'un règlement déclaré, donc même motif en deux temps
 * (formulaire puis `AlertDialog` récapitulatif).
 */

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { FormField } from "@/components/form/form-field";
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
import { recordManualPayment } from "@/lib/api/editor";
import type { CurrencyOut, OfferOut, OrganizationSummaryOut, PaymentMethod, PaymentOut, PaymentRecordManual } from "@/lib/api/types";
import { formatWithCurrencyFormat } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/roles";

const manualSchema = z.object({
  organization_id: z.string().min(1, "Choisissez une organisation."),
  offer_id: z.string().min(1, "Choisissez une offre."),
  validated_amount: z.number({ message: "Montant requis." }).gt(0, "Le montant doit être supérieur à zéro."),
  currency_code: z.string().min(1, "Choisissez une devise."),
  method: z.string().min(1, "Choisissez un moyen de paiement."),
  validated_reference: z.string().max(120, "120 caractères maximum.").optional(),
});
type ManualValues = z.infer<typeof manualSchema>;

export interface ManualPaymentDialogProps {
  accessToken: string;
  organizations: OrganizationSummaryOut[];
  offers: OfferOut[];
  currencies: CurrencyOut[];
  trigger: ReactNode;
  onRecorded: (payment: PaymentOut) => void;
}

const EMPTY_DEFAULTS: ManualValues = {
  organization_id: "",
  offer_id: "",
  validated_amount: undefined as unknown as number,
  currency_code: "",
  method: "",
  validated_reference: "",
};

export function ManualPaymentDialog({ accessToken, organizations, offers, currencies, trigger, onRecorded }: ManualPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PaymentRecordManual | null>(null);

  const form = useForm<ManualValues>({ resolver: zodResolver(manualSchema), defaultValues: EMPTY_DEFAULTS });
  const { control, register, handleSubmit, formState } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) form.reset(EMPTY_DEFAULTS);
  }

  function reviewChanges(values: ManualValues) {
    setPending({
      organization_id: values.organization_id,
      offer_id: values.offer_id,
      validated_amount: values.validated_amount,
      currency_code: values.currency_code,
      method: values.method as PaymentMethod,
      validated_reference: values.validated_reference?.trim() || undefined,
    });
    setOpen(false);
  }

  const mutation = useMutation({
    mutationFn: (payload: PaymentRecordManual) => recordManualPayment(accessToken, payload),
    onSuccess: (payment) => {
      toast.success("Paiement enregistré — abonnement renouvelé, facture émise.");
      onRecorded(payment);
      setPending(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Enregistrement du paiement impossible.");
      setPending(null);
    },
  });

  const pendingOrganization = organizations.find((o) => o.organization_id === pending?.organization_id);
  const pendingOffer = offers.find((o) => o.id === pending?.offer_id);
  const pendingCurrency = currencies.find((c) => c.code === pending?.currency_code);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
            <DialogDescription>
              Pour un règlement reçu par un canal sans déclaration préalable dans l&apos;application (§12.4).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(reviewChanges)} noValidate className="space-y-3">
            <FormField id="manual-org" label="Organisation" error={formState.errors.organization_id?.message}>
              <Controller
                control={control}
                name="organization_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="manual-org" className="w-full">
                      <SelectValue placeholder="Choisir une organisation" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.organization_id} value={org.organization_id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField id="manual-offer" label="Offre" error={formState.errors.offer_id?.message}>
              <Controller
                control={control}
                name="offer_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="manual-offer" className="w-full">
                      <SelectValue placeholder="Choisir une offre" />
                    </SelectTrigger>
                    <SelectContent>
                      {offers.map((offer) => (
                        <SelectItem key={offer.id} value={offer.id}>
                          {offer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField id="manual-amount" label="Montant reçu" error={formState.errors.validated_amount?.message}>
                <Input
                  id="manual-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("validated_amount", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
                />
              </FormField>
              <FormField id="manual-currency" label="Devise" error={formState.errors.currency_code?.message}>
                <Controller
                  control={control}
                  name="currency_code"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="manual-currency" className="w-full">
                        <SelectValue placeholder="Devise" />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            <FormField id="manual-method" label="Moyen de paiement" error={formState.errors.method?.message}>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="manual-method" className="w-full">
                      <SelectValue placeholder="Choisir un moyen" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField id="manual-reference" label="Référence" hint="Facultatif" error={formState.errors.validated_reference?.message}>
              <Input id="manual-reference" {...register("validated_reference")} />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">Vérifier avant de confirmer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pending)} onOpenChange={(next) => !next && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l&apos;enregistrement ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  <span className="font-medium text-foreground">{pendingOrganization?.name}</span> — {pendingOffer?.name}
                </p>
                {pending ? (
                  <p>
                    <span className="font-medium text-foreground">
                      {formatWithCurrencyFormat(pending.validated_amount, pendingCurrency)}
                    </span>{" "}
                    · {PAYMENT_METHOD_LABELS[pending.method]}
                    {pending.validated_reference ? ` · Réf. ${pending.validated_reference}` : ""}
                  </p>
                ) : null}
                <p className="text-muted-foreground">L&apos;abonnement est renouvelé et une facture est émise immédiatement.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={mutation.isPending} onClick={() => pending && mutation.mutate(pending)}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Enregistrer le paiement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
