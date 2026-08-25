"use client";

/**
 * Report d'une alerte (cahier des charges §8.3 : « l'utilisateur demande à être
 * relancé dans n jours »). Dialogue piloté par le parent, comme
 * `dashboard/drilldown-dialog.tsx`.
 *
 * L'appelant ne doit ouvrir ce dialogue que pour une alerte sur laquelle
 * l'utilisateur a le droit d'agir (`canActOnAlert`) : le backend répondrait 403.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postponeAlert } from "@/lib/api/alerts";
import { ApiError } from "@/lib/api/errors";
import type { AlertOut } from "@/lib/api/types";

/** Date locale au format AAAA-MM-JJ. `toISOString()` passerait par UTC et
 * décalerait la veille au soir d'un jour entier. */
function toIsoDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function addDays(days: number): string {
  const target = new Date();
  target.setDate(target.getDate() + days);
  return toIsoDate(target);
}

export function PostponeAlertDialog({
  alert,
  open,
  onOpenChange,
  accessToken,
  organizationId,
  onPostponed,
}: {
  alert: AlertOut | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  organizationId: string;
  onPostponed: (alert: AlertOut) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reporter l&apos;alerte</DialogTitle>
          <DialogDescription>
            Choisissez la date à laquelle vous souhaitez être relancé. L&apos;alerte reste dans la liste
            jusque-là.
          </DialogDescription>
        </DialogHeader>
        {/* Le formulaire est un composant à part, monté par le portail Radix
            seulement quand le dialogue est ouvert : sa date par défaut se
            recalcule donc à chaque ouverture, sans effet de synchronisation.
            La `key` fait de même quand on enchaîne deux alertes différentes. */}
        {alert ? (
          <PostponeForm
            key={alert.id}
            alert={alert}
            accessToken={accessToken}
            organizationId={organizationId}
            onPostponed={onPostponed}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PostponeForm({
  alert,
  accessToken,
  organizationId,
  onPostponed,
  onClose,
}: {
  alert: AlertOut;
  accessToken: string;
  organizationId: string;
  onPostponed: (alert: AlertOut) => void;
  onClose: () => void;
}) {
  const today = toIsoDate(new Date());
  const [value, setValue] = useState(() => addDays(7));

  const mutation = useMutation({
    mutationFn: () => postponeAlert(accessToken, organizationId, alert.id, { postponed_until: value }),
    onSuccess: (updated) => {
      toast.success("Alerte reportée.");
      onPostponed(updated);
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Impossible de reporter cette alerte.");
    },
  });

  const isPast = value < today;
  const canSubmit = value.length > 0 && !isPast && !mutation.isPending;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="postponed-until">Relancer le</Label>
        <Input
          id="postponed-until"
          type="date"
          min={today}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {isPast ? (
          <p className="text-xs text-destructive">La date de relance doit être aujourd&apos;hui ou plus tard.</p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button type="button" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Reporter
        </Button>
      </DialogFooter>
    </>
  );
}
