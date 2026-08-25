"use client";

/**
 * Suivi de consignation (cahier des charges §7.6) — n'est affiché que si
 * `config.is_consigned`. Trois compteurs par (variante, dépôt) : pleines
 * (= le niveau de stock courant), vides en dépôt, en circulation chez les
 * clients — plus le montant de consigne encaissé. Une sortie de bouteille
 * pleine incrémente la circulation *et* diminue le stock plein (le backend
 * enregistre une sortie normale en plus du compteur) ; un retour de vide la
 * décrémente. La v1 se limite à des compteurs globaux par dépôt, pas de suivi
 * nominatif par client (§7.6, hors périmètre).
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PackageCheck, PackageX } from "lucide-react";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { getConsignmentSummary, recordConsignmentAction } from "@/lib/api/stock";
import type { ArticleVariantOut, DepotOut } from "@/lib/api/types";
import { formatAmount } from "@/lib/format";
import { variantLabel } from "@/lib/stock-format";

export interface ConsignmentPanelProps {
  organizationId: string;
  accessToken: string;
  variants: ArticleVariantOut[];
  depots: DepotOut[];
  currencyCode?: string;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-medium text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function ConsignmentPanel({ organizationId, accessToken, variants, depots, currencyCode }: ConsignmentPanelProps) {
  const activeDepots = depots.filter((d) => d.is_active);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [depotId, setDepotId] = useState(activeDepots[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const queryClient = useQueryClient();

  const summaryQueryKey = ["consignment-summary", organizationId, variantId, depotId];
  const summaryQuery = useQuery({
    queryKey: summaryQueryKey,
    queryFn: () => getConsignmentSummary(accessToken, organizationId, variantId, depotId),
    enabled: Boolean(variantId && depotId),
  });

  const actionMutation = useMutation({
    mutationFn: (action: "deliver_full" | "return_empty") =>
      recordConsignmentAction(accessToken, organizationId, {
        variant_id: variantId,
        depot_id: depotId,
        action,
        quantity: Number(quantity),
        deposit_amount: action === "deliver_full" && depositAmount.trim() ? Number(depositAmount) : null,
      }),
    onSuccess: (summary) => {
      toast.success("Consignation mise à jour.");
      queryClient.setQueryData(summaryQueryKey, summary);
      void queryClient.invalidateQueries({ queryKey: ["stock-levels", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["stock-movements", organizationId] });
      setQuantity("");
      setDepositAmount("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Action impossible."),
  });

  const quantityValue = Number(quantity);
  const canAct = Boolean(variantId && depotId) && quantity.trim() !== "" && Number.isFinite(quantityValue) && quantityValue > 0;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="font-heading text-base font-medium text-foreground">Consignation</h3>
        <p className="text-sm text-muted-foreground">
          La bouteille circule, le contenu se vend — une sortie pleine incrémente la circulation, un retour de vide
          la décrémente.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="cons-variant" label="Variante">
          <Select value={variantId} onValueChange={setVariantId}>
            <SelectTrigger id="cons-variant" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variants.map((variant) => (
                <SelectItem key={variant.id} value={variant.id}>
                  {variantLabel(variant)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="cons-depot" label="Dépôt">
          <Select value={depotId} onValueChange={setDepotId}>
            <SelectTrigger id="cons-depot" className="w-full">
              <SelectValue placeholder="Choisir un dépôt" />
            </SelectTrigger>
            <SelectContent>
              {activeDepots.map((depot) => (
                <SelectItem key={depot.id} value={depot.id}>
                  {depot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {activeDepots.length === 0 ? (
        <p className="text-sm text-muted-foreground">Créez un dépôt actif pour suivre la consignation.</p>
      ) : summaryQuery.isLoading ? (
        <Skeleton className="h-20 w-full rounded-lg" />
      ) : summaryQuery.data ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Pleines (en stock)" value={summaryQuery.data.full_count} />
          <StatTile label="Vides en dépôt" value={summaryQuery.data.empty_count} />
          <StatTile label="En circulation" value={summaryQuery.data.in_circulation_count} />
          <StatTile label="Consignes encaissées" value={formatAmount(summaryQuery.data.deposit_amount_collected, currencyCode)} />
        </div>
      ) : null}

      {activeDepots.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <FormField id="cons-quantity" label="Quantité" className="w-24">
            <Input id="cons-quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </FormField>
          <FormField id="cons-deposit-amount" label="Consigne perçue" hint="Facultatif" className="w-36">
            <Input
              id="cons-deposit-amount"
              type="number"
              step="0.01"
              min={0}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            disabled={!canAct || actionMutation.isPending}
            onClick={() => actionMutation.mutate("deliver_full")}
          >
            {actionMutation.isPending && actionMutation.variables === "deliver_full" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PackageCheck className="size-3.5" />
            )}
            Sortie pleine
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canAct || actionMutation.isPending}
            onClick={() => actionMutation.mutate("return_empty")}
          >
            {actionMutation.isPending && actionMutation.variables === "return_empty" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PackageX className="size-3.5" />
            )}
            Retour vide
          </Button>
        </div>
      ) : null}
    </section>
  );
}
