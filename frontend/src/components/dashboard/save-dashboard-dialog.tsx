"use client";

/** Enregistre le périmètre courant du tableau de bord sous un nom (cahier des
 * charges §10.4 : "Parc Douala", "Gaz — dépôt Bonabéri"...). Même gabarit que
 * `DepotFormDialog` (formulaire minimal, react-hook-form + zod). */

import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
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
import type { DashboardScopeState } from "@/components/dashboard/types";
import { ApiError } from "@/lib/api/errors";
import { createSavedDashboard } from "@/lib/api/dashboards";
import type { SavedDashboardOut } from "@/lib/api/types";

const schema = z.object({
  name: z.string().min(1, "Le nom est obligatoire.").max(120, "120 caractères maximum."),
});
type Values = z.infer<typeof schema>;

export interface SaveDashboardDialogProps {
  organizationId: string;
  accessToken: string;
  scope: DashboardScopeState;
  trigger: ReactNode;
  onSaved: (dashboard: SavedDashboardOut) => void;
}

export function SaveDashboardDialog({
  organizationId,
  accessToken,
  scope,
  trigger,
  onSaved,
}: SaveDashboardDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) form.reset({ name: "" });
  }

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      createSavedDashboard(accessToken, organizationId, {
        name: values.name.trim(),
        model_definition_id: scope.modelId,
        depot_id: scope.depotId,
        site: scope.site.trim() || null,
        period: scope.period,
      }),
    onSuccess: (dashboard) => {
      toast.success("Tableau de bord enregistré.");
      onSaved(dashboard);
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Enregistrement impossible."),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Enregistrer ce tableau de bord</DialogTitle>
          <DialogDescription>
            Le périmètre actuel — modèle, dépôt ou site, période — est enregistré sous ce nom et
            réapparaît dans « Mes tableaux de bord » (§10.4).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-3">
          <FormField id="dashboard-name" label="Nom" error={form.formState.errors.name?.message}>
            <Input id="dashboard-name" placeholder="Ex. Parc Douala" autoFocus {...form.register("name")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
