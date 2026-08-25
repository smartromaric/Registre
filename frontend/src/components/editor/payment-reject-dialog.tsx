"use client";

/**
 * Rejet d'un règlement déclaré (cahier des charges §12.4, §13) — motif
 * obligatoire. Un seul champ, donc un seul `AlertDialog` plutôt qu'un
 * formulaire séparé : la zone de motif est directement dans la boîte de
 * confirmation, dont l'action reste désactivée tant qu'aucun motif n'est
 * saisi.
 */

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";
import { rejectPayment } from "@/lib/api/editor";
import type { PaymentOut } from "@/lib/api/types";

export interface PaymentRejectDialogProps {
  accessToken: string;
  payment: PaymentOut;
  organizationName: string;
  trigger: ReactNode;
  onRejected: (payment: PaymentOut) => void;
  onStale: () => void;
}

export function PaymentRejectDialog({ accessToken, payment, organizationName, trigger, onRejected, onStale }: PaymentRejectDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setReason("");
  }

  const mutation = useMutation({
    mutationFn: () => rejectPayment(accessToken, payment.id, { reason: reason.trim() }),
    onSuccess: (updated) => {
      toast.success(`Paiement de ${organizationName} rejeté.`);
      onRejected(updated);
      setOpen(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Ce paiement a déjà été traité par ailleurs — file mise à jour.");
        onStale();
        setOpen(false);
      } else {
        toast.error(err instanceof ApiError ? err.message : "Rejet du paiement impossible.");
      }
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rejeter le paiement ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                <span className="font-medium text-foreground">{organizationName}</span> — déclaré {payment.declared_amount ?? "—"},
                référence « {payment.declared_reference ?? "—"} ».
              </p>
              <div className="space-y-1.5">
                <label htmlFor="reject-reason" className="text-xs font-medium text-foreground">
                  Motif du rejet
                </label>
                <Textarea
                  id="reject-reason"
                  rows={3}
                  placeholder="Ex. référence introuvable, montant ne correspondant à aucune offre…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.isPending || reason.trim().length === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Rejeter le paiement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
