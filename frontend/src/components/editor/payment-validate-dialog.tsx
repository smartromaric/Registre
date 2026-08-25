"use client";

/**
 * Vérification et validation d'un règlement déclaré (cahier des charges
 * §12.4, §13) — la déclaration de l'organisation reste affichée pendant toute
 * la saisie pour ne jamais valider à l'aveugle : le montant réellement reçu,
 * la devise et le moyen de paiement peuvent différer de ce que l'organisation
 * a indiqué. En deux temps (formulaire puis `AlertDialog` récapitulatif),
 * même motif que `SubscriptionAdjustDialog` : valider renouvelle
 * l'abonnement et émet une facture, ce n'est pas un geste anodin.
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
import { validatePayment } from "@/lib/api/editor";
import type { CurrencyOut, PaymentMethod, PaymentOut, PaymentValidate } from "@/lib/api/types";
import { formatDateTime, formatWithCurrencyFormat } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/roles";

const validateSchema = z.object({
  validated_amount: z.number({ message: "Montant requis." }).gt(0, "Le montant doit être supérieur à zéro."),
  currency_code: z.string().min(1, "Choisissez une devise."),
  method: z.string().min(1, "Choisissez un moyen de paiement."),
  validated_reference: z.string().max(120, "120 caractères maximum.").optional(),
});
type ValidateValues = z.infer<typeof validateSchema>;

export interface PaymentValidateDialogProps {
  accessToken: string;
  payment: PaymentOut;
  organizationName: string;
  offerName: string;
  currencies: CurrencyOut[];
  trigger: ReactNode;
  onValidated: (payment: PaymentOut) => void;
  /** Le paiement a déjà été traité par un autre éditeur entre-temps (409) — le
   * parent doit rafraîchir la file plutôt qu'afficher une erreur générique. */
  onStale: () => void;
}

export function PaymentValidateDialog({
  accessToken,
  payment,
  organizationName,
  offerName,
  currencies,
  trigger,
  onValidated,
  onStale,
}: PaymentValidateDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PaymentValidate | null>(null);

  const form = useForm<ValidateValues>({
    resolver: zodResolver(validateSchema),
    defaultValues: {
      validated_amount: payment.declared_amount ?? undefined,
      currency_code: "",
      method: "",
      validated_reference: payment.declared_reference ?? "",
    },
  });
  const { control, register, handleSubmit, formState } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({
        validated_amount: payment.declared_amount ?? undefined,
        currency_code: "",
        method: "",
        validated_reference: payment.declared_reference ?? "",
      });
    }
  }

  function reviewChanges(values: ValidateValues) {
    setPending({
      validated_amount: values.validated_amount,
      currency_code: values.currency_code,
      method: values.method as PaymentMethod,
      validated_reference: values.validated_reference?.trim() || undefined,
    });
    setOpen(false);
  }

  const mutation = useMutation({
    mutationFn: (payload: PaymentValidate) => validatePayment(accessToken, payment.id, payload),
    onSuccess: (updated) => {
      toast.success(`Paiement de ${organizationName} validé — abonnement renouvelé, facture émise.`);
      onValidated(updated);
      setPending(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Ce paiement a déjà été traité par ailleurs — file mise à jour.");
        onStale();
      } else {
        toast.error(err instanceof ApiError ? err.message : "Validation du paiement impossible.");
      }
      setPending(null);
    },
  });

  const currency = currencies.find((c) => c.code === pending?.currency_code);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Valider le paiement</DialogTitle>
            <DialogDescription>{organizationName} — offre {offerName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Déclaration de l&apos;organisation</p>
            <p className="text-muted-foreground">
              Montant déclaré : {payment.declared_amount ?? "—"} · Référence : {payment.declared_reference ?? "—"}
            </p>
            <p className="text-muted-foreground">Déclaré le {formatDateTime(payment.created_at)}</p>
          </div>

          <form onSubmit={handleSubmit(reviewChanges)} noValidate className="space-y-3">
            <FormField id="validate-amount" label="Montant réellement reçu" error={formState.errors.validated_amount?.message}>
              <Input
                id="validate-amount"
                type="number"
                step="0.01"
                min="0"
                {...register("validated_amount", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
              />
            </FormField>

            <FormField id="validate-currency" label="Devise" error={formState.errors.currency_code?.message}>
              <Controller
                control={control}
                name="currency_code"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="validate-currency" className="w-full">
                      <SelectValue placeholder="Choisir une devise" />
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

            <FormField id="validate-method" label="Moyen de paiement" error={formState.errors.method?.message}>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="validate-method" className="w-full">
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

            <FormField
              id="validate-reference"
              label="Référence"
              hint="Facultatif — laissez la référence déclarée si elle est correcte."
              error={formState.errors.validated_reference?.message}
            >
              <Input id="validate-reference" {...register("validated_reference")} />
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
            <AlertDialogTitle>Confirmer la validation ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  <span className="font-medium text-foreground">{organizationName}</span> — {offerName}
                </p>
                {pending ? (
                  <p>
                    <span className="font-medium text-foreground">
                      {formatWithCurrencyFormat(pending.validated_amount, currency)}
                    </span>{" "}
                    · {PAYMENT_METHOD_LABELS[pending.method]}
                    {pending.validated_reference ? ` · Réf. ${pending.validated_reference}` : ""}
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  L&apos;abonnement est prolongé à partir de l&apos;échéance en cours et une facture est émise
                  automatiquement.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={mutation.isPending} onClick={() => pending && mutation.mutate(pending)}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Valider le paiement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
