"use client";

/**
 * Prolongation/suspension/réactivation manuelle d'un abonnement (cahier des
 * charges §12.4, §13) — geste commercial ou litige, motif obligatoire inscrit
 * au journal d'audit. En deux temps comme l'ajustement de stock
 * (`components/stock/movement-dialog.tsx`) : un formulaire classique pour
 * saisir les champs, puis un `AlertDialog` qui récapitule exactement ce qui
 * va changer — statut, échéance, motif — avant tout envoi. Rien n'est
 * "silencieux" ici : c'est une bascule qui change directement ce qu'un client
 * peut faire dans l'application.
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";
import { adjustSubscription } from "@/lib/api/editor";
import type { OrganizationSummaryOut, SubscriptionAdminAdjust, SubscriptionOut, SubscriptionStatus } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/roles";

const KEEP_STATUS = "__keep__";

const adjustSchema = z
  .object({
    new_status: z.string(), // KEEP_STATUS ou un SubscriptionStatus
    new_period_end: z.string(), // datetime-local ou ""
    reason: z.string().min(1, "Le motif est obligatoire.").max(300, "300 caractères maximum."),
  })
  .superRefine((v, ctx) => {
    if (v.new_status === KEEP_STATUS && v.new_period_end.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["new_status"],
        message: "Changez le statut, l'échéance, ou les deux.",
      });
    }
  });
type AdjustValues = z.infer<typeof adjustSchema>;

export interface SubscriptionAdjustDialogProps {
  accessToken: string;
  organization: OrganizationSummaryOut;
  trigger: ReactNode;
  onAdjusted: (subscription: SubscriptionOut) => void;
}

export function SubscriptionAdjustDialog({ accessToken, organization, trigger, onAdjusted }: SubscriptionAdjustDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<SubscriptionAdminAdjust | null>(null);

  const form = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { new_status: KEEP_STATUS, new_period_end: "", reason: "" },
  });
  const { control, register, handleSubmit, formState } = form;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) form.reset({ new_status: KEEP_STATUS, new_period_end: "", reason: "" });
  }

  function reviewChanges(values: AdjustValues) {
    setPending({
      new_status: values.new_status === KEEP_STATUS ? undefined : (values.new_status as SubscriptionStatus),
      new_period_end: values.new_period_end.trim() ? new Date(values.new_period_end).toISOString() : undefined,
      reason: values.reason.trim(),
    });
    setOpen(false);
  }

  const mutation = useMutation({
    mutationFn: (payload: SubscriptionAdminAdjust) =>
      adjustSubscription(accessToken, organization.organization_id, payload),
    onSuccess: (subscription) => {
      toast.success(`Abonnement de ${organization.name} mis à jour.`);
      onAdjusted(subscription);
      setPending(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Ajustement de l'abonnement impossible.");
      setPending(null);
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajuster l&apos;abonnement</DialogTitle>
            <DialogDescription>
              {organization.name} — actuellement {SUBSCRIPTION_STATUS_LABELS[organization.subscription_status]}, jusqu&apos;au{" "}
              {formatDateTime(organization.current_period_end)}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(reviewChanges)} noValidate className="space-y-3">
            <FormField id="adjust-status" label="Nouveau statut" error={formState.errors.new_status?.message}>
              <Controller
                control={control}
                name="new_status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="adjust-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP_STATUS}>Ne pas changer</SelectItem>
                      {(Object.entries(SUBSCRIPTION_STATUS_LABELS) as [SubscriptionStatus, string][]).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField
              id="adjust-period-end"
              label="Nouvelle échéance"
              hint="Facultatif — laissez vide pour ne pas la changer."
              error={formState.errors.new_period_end?.message}
            >
              <Input id="adjust-period-end" type="datetime-local" {...register("new_period_end")} />
            </FormField>

            <FormField
              id="adjust-reason"
              label="Motif"
              hint="Obligatoire — inscrit au journal d'audit (§12.4)."
              error={formState.errors.reason?.message}
            >
              <Textarea id="adjust-reason" rows={3} placeholder="Ex. geste commercial, litige résolu par téléphone…" {...register("reason")} />
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
            <AlertDialogTitle>Confirmer l&apos;ajustement ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  <span className="font-medium text-foreground">{organization.name}</span>
                </p>
                {pending?.new_status ? (
                  <p>
                    Statut : {SUBSCRIPTION_STATUS_LABELS[organization.subscription_status]} →{" "}
                    <span className="font-medium text-foreground">{SUBSCRIPTION_STATUS_LABELS[pending.new_status]}</span>
                  </p>
                ) : null}
                {pending?.new_period_end ? (
                  <p>
                    Échéance : {formatDateTime(organization.current_period_end)} →{" "}
                    <span className="font-medium text-foreground">{formatDateTime(pending.new_period_end)}</span>
                  </p>
                ) : null}
                <p className="text-muted-foreground">Motif : « {pending?.reason} »</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={mutation.isPending} onClick={() => pending && mutation.mutate(pending)}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Confirmer l&apos;ajustement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
