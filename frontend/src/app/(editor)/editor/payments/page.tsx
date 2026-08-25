"use client";

/**
 * File des règlements déclarés (cahier des charges §12.4, §13) — traitée
 * comme une vraie file d'attente (cartes, plus ancien en premier, tel que le
 * renvoie `GET /editor/payments`) plutôt qu'un tableau générique : c'est là
 * qu'un éditeur vérifie la réception réelle des fonds avant de valider ou de
 * rejeter chaque déclaration.
 *
 * `PaymentOut` ne porte que des identifiants (`organization_id`, `offer_id`),
 * pas de noms — cette page recoupe la file avec `GET /editor/organizations`
 * et `GET /editor/offers` (toutes les offres, y compris désactivées — pas le
 * catalogue public, actives uniquement : un paiement peut viser une offre
 * depuis retirée de la vente) pour afficher des noms plutôt que des UUID,
 * comme le demande le cahier des charges (§12.4 : "le nom de l'organisation,
 * l'offre visée, la référence et la date").
 */

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus } from "lucide-react";

import { ManualPaymentDialog } from "@/components/editor/manual-payment-dialog";
import { PaymentRejectDialog } from "@/components/editor/payment-reject-dialog";
import { PaymentValidateDialog } from "@/components/editor/payment-validate-dialog";
import { EmptyState, ErrorState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { listCurrencies, listDeclaredPayments, listOffers, listOrganizations } from "@/lib/api/editor";
import type { PaymentOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDateTime } from "@/lib/format";

export default function EditorPaymentsPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const paymentsQuery = useQuery({
    queryKey: ["editor-payments-queue"],
    queryFn: () => listDeclaredPayments(accessToken as string),
    enabled: Boolean(accessToken),
  });
  const organizationsQuery = useQuery({
    queryKey: ["editor-organizations"],
    queryFn: () => listOrganizations(accessToken as string),
    enabled: Boolean(accessToken),
  });
  const offersQuery = useQuery({
    queryKey: ["editor-catalog-offers"],
    queryFn: () => listOffers(accessToken as string),
    enabled: Boolean(accessToken),
  });
  const currenciesQuery = useQuery({
    queryKey: ["editor-catalog-currencies"],
    queryFn: () => listCurrencies(accessToken as string),
    enabled: Boolean(accessToken),
  });

  const organizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data]);
  const offers = useMemo(() => offersQuery.data ?? [], [offersQuery.data]);
  const currencies = currenciesQuery.data ?? [];

  const orgById = useMemo(() => new Map(organizations.map((o) => [o.organization_id, o])), [organizations]);
  const offerById = useMemo(() => new Map(offers.map((o) => [o.id, o])), [offers]);

  function removeFromQueue(paymentId: string) {
    queryClient.setQueryData<PaymentOut[]>(["editor-payments-queue"], (prev) => prev?.filter((p) => p.id !== paymentId));
  }

  function refreshQueue() {
    void queryClient.invalidateQueries({ queryKey: ["editor-payments-queue"] });
  }

  const payments = paymentsQuery.data ?? [];
  const isLoading = paymentsQuery.isLoading || organizationsQuery.isLoading || offersQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Règlements</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            File des paiements déclarés par les organisations, du plus ancien au plus récent (§12.4).
          </p>
        </div>
        <ManualPaymentDialog
          accessToken={accessToken as string}
          organizations={organizations}
          offers={offers}
          currencies={currencies}
          // Un paiement manuel est déjà validé : rien à retirer de la file
          // (il n'y entre jamais), mais l'organisation touchée doit refléter
          // son nouvel abonnement dans la liste éditeur.
          onRecorded={() => void queryClient.invalidateQueries({ queryKey: ["editor-organizations"] })}
          trigger={
            <Button variant="outline">
              <Plus className="size-4" />
              Enregistrer un paiement
            </Button>
          }
        />
      </div>

      {paymentsQuery.isError ? (
        <ErrorState
          message={paymentsQuery.error instanceof ApiError ? paymentsQuery.error.message : "Erreur inconnue."}
          onRetry={() => void paymentsQuery.refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="File vide"
          description="Aucun règlement en attente de vérification pour le moment."
        />
      ) : (
        <ul className="space-y-3">
          {payments.map((payment) => {
            const org = orgById.get(payment.organization_id);
            const offer = offerById.get(payment.offer_id);
            return (
              <li key={payment.id} className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{org?.name ?? "Organisation inconnue"}</p>
                    <p className="text-sm text-muted-foreground">
                      Offre {offer?.name ?? "—"} · Montant déclaré {payment.declared_amount ?? "—"} · Référence «{" "}
                      {payment.declared_reference ?? "—"} »
                    </p>
                    <p className="text-xs text-muted-foreground">Déclaré le {formatDateTime(payment.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <PaymentRejectDialog
                      accessToken={accessToken as string}
                      payment={payment}
                      organizationName={org?.name ?? "cette organisation"}
                      onRejected={() => removeFromQueue(payment.id)}
                      onStale={refreshQueue}
                      trigger={
                        <Button variant="outline" size="sm">
                          Rejeter
                        </Button>
                      }
                    />
                    <PaymentValidateDialog
                      accessToken={accessToken as string}
                      payment={payment}
                      organizationName={org?.name ?? "cette organisation"}
                      offerName={offer?.name ?? "—"}
                      currencies={currencies}
                      onValidated={() => removeFromQueue(payment.id)}
                      onStale={refreshQueue}
                      trigger={<Button size="sm">Valider</Button>}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
