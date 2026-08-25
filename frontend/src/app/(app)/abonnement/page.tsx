"use client";

/**
 * Écran d'abonnement de l'organisation (cahier des charges §12) : état du
 * cycle de vie, déclaration de paiement, historique des règlements et des
 * factures. Visible par tout membre (`GET .../subscription` n'exige aucun
 * rôle particulier côté backend), mais déclarer un paiement et consulter
 * l'historique restent réservés à l'ADMIN de l'organisation — comme le
 * backend (`require_role(OrgRole.ADMIN)` sur les trois autres routes), pas
 * seulement l'UI qui masquerait un bouton.
 *
 * À ne pas confondre avec l'espace éditeur (`app/(editor)/`) : ici, une seule
 * organisation consulte et déclare ; là-bas, l'éditeur de la plateforme
 * vérifie et enregistre pour toutes les organisations (§4.3, §13).
 */

import { useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { motion, useReducedMotion } from "framer-motion";
import { CreditCard, FileText, History, ShieldAlert } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DeclarePaymentDialog } from "@/components/subscription/declare-payment-dialog";
import { EmptyState, ErrorState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { listCurrencies, listOffers } from "@/lib/api/catalog";
import { getSubscription, listInvoices, listPayments } from "@/lib/api/subscriptions";
import type { CurrencyOut, InvoiceOut, PaymentOut, SubscriptionStatus } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate, formatDateTime, formatWithCurrencyFormat } from "@/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONE_CLASSES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE_CLASSES,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

function daysUntil(iso: string): number {
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / 86_400_000);
}

export default function SubscriptionPage() {
  const reduceMotion = useReducedMotion();
  const { accessToken, currentOrganizationId, currentOrganization } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = currentOrganization?.my_role === "admin";

  const subscriptionQuery = useQuery({
    queryKey: ["subscription", currentOrganizationId],
    queryFn: () => getSubscription(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
  });

  const offersQuery = useQuery({
    queryKey: ["catalog-offers"],
    queryFn: () => listOffers(accessToken as string),
    enabled: Boolean(accessToken),
  });

  const currenciesQuery = useQuery({
    queryKey: ["catalog-currencies"],
    queryFn: () => listCurrencies(accessToken as string),
    enabled: Boolean(accessToken),
  });

  const paymentsQuery = useQuery({
    queryKey: ["subscription-payments", currentOrganizationId],
    queryFn: () => listPayments(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId) && isAdmin,
  });

  const invoicesQuery = useQuery({
    queryKey: ["subscription-invoices", currentOrganizationId],
    queryFn: () => listInvoices(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId) && isAdmin,
  });

  const offerById = useMemo(() => new Map((offersQuery.data ?? []).map((o) => [o.id, o])), [offersQuery.data]);
  const currencyByCode = useMemo(
    () => new Map((currenciesQuery.data ?? []).map((c) => [c.code, c])),
    [currenciesQuery.data],
  );
  const orgCurrency = currentOrganization ? currencyByCode.get(currentOrganization.currency_code) : undefined;

  function formatMoney(amount: number, currency?: CurrencyOut | null, code?: string | null): string {
    if (currency) return formatWithCurrencyFormat(amount, currency);
    if (code) return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} ${code}`;
    return formatWithCurrencyFormat(amount, undefined);
  }

  function invalidateSubscription() {
    void queryClient.invalidateQueries({ queryKey: ["subscription", currentOrganizationId] });
    void queryClient.invalidateQueries({ queryKey: ["subscription-payments", currentOrganizationId] });
  }

  const subscription = subscriptionQuery.data;
  const offer = subscription?.offer_id ? offerById.get(subscription.offer_id) : undefined;

  const paymentColumns: ColumnDef<PaymentOut, unknown>[] = [
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => <span className="text-sm">{formatDateTime(row.original.created_at)}</span>,
    },
    {
      id: "offer",
      header: "Offre",
      cell: ({ row }) => {
        const o = offerById.get(row.original.offer_id);
        return <span className="text-sm">{o?.name ?? "—"}</span>;
      },
    },
    {
      id: "declared",
      header: "Montant déclaré",
      cell: ({ row }) =>
        row.original.declared_amount != null ? (
          <span className="font-medium tabular-nums text-foreground">
            {formatMoney(row.original.declared_amount, orgCurrency, currentOrganization?.currency_code)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "reference",
      header: "Référence",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.declared_reference ?? row.original.validated_reference ?? "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            PAYMENT_STATUS_TONE_CLASSES[row.original.status],
          )}
        >
          {PAYMENT_STATUS_LABELS[row.original.status]}
        </span>
      ),
    },
    {
      id: "detail",
      header: "Détail",
      cell: ({ row }) => {
        const p = row.original;
        if (p.status === "validated") {
          return (
            <span className="text-sm text-muted-foreground">
              {p.validated_amount != null ? formatMoney(p.validated_amount, undefined, p.currency_code) : ""}
              {p.method ? ` · ${PAYMENT_METHOD_LABELS[p.method]}` : ""}
            </span>
          );
        }
        if (p.status === "rejected") {
          return <span className="text-sm text-destructive">{p.rejection_reason ?? "Rejeté"}</span>;
        }
        return <span className="text-sm text-muted-foreground">En attente de vérification</span>;
      },
    },
  ];

  const invoiceColumns: ColumnDef<InvoiceOut, unknown>[] = [
    { id: "number", header: "Facture", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    {
      id: "amount",
      header: "Montant",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatMoney(row.original.amount, undefined, row.original.currency_code)}</span>
      ),
    },
    {
      id: "period",
      header: "Période",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.period_start)} – {formatDate(row.original.period_end)}
        </span>
      ),
    },
    {
      id: "issued",
      header: "Émise le",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateTime(row.original.issued_at)}</span>,
    },
  ];

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Abonnement</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cycle de vie, devise et facturation de {currentOrganization?.name ?? "votre organisation"} (§12).
        </p>
      </div>

      {subscriptionQuery.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : subscriptionQuery.isError ? (
        <ErrorState
          message={
            subscriptionQuery.error instanceof ApiError ? subscriptionQuery.error.message : "Erreur inconnue."
          }
          onRetry={() => void subscriptionQuery.refetch()}
        />
      ) : subscription ? (
        <SubscriptionHero
          statusLabel={SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          toneClass={SUBSCRIPTION_STATUS_TONE_CLASSES[subscription.status]}
          statusKey={subscription.status}
          currentPeriodEnd={subscription.current_period_end}
          readOnlySince={subscription.read_only_since}
          suspendedSince={subscription.suspended_since}
          offerName={offer?.name}
          action={
            isAdmin ? (
              <DeclarePaymentDialog
                organizationId={currentOrganizationId as string}
                accessToken={accessToken as string}
                offers={offersQuery.data ?? []}
                currency={orgCurrency}
                onDeclared={() => {
                  invalidateSubscription();
                }}
                trigger={
                  <Button>
                    <CreditCard className="size-4" />
                    Déclarer un paiement
                  </Button>
                }
              />
            ) : null
          }
        />
      ) : null}

      {!isAdmin ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Seul un administrateur de l&apos;organisation peut déclarer un paiement ou consulter l&apos;historique des
          règlements et des factures.
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <History className="size-4" />
              Historique des règlements
            </h2>
            <DataTable<PaymentOut>
              columns={paymentColumns}
              data={paymentsQuery.data ?? []}
              getRowId={(row) => row.id}
              isLoading={paymentsQuery.isFetching}
              error={
                paymentsQuery.isError
                  ? paymentsQuery.error instanceof ApiError
                    ? paymentsQuery.error.message
                    : "Erreur inconnue."
                  : null
              }
              onRetry={() => void paymentsQuery.refetch()}
              emptyState={
                <EmptyState
                  icon={CreditCard}
                  title="Aucun règlement"
                  description="Les paiements que vous déclarez apparaissent ici, avec leur statut de vérification."
                  className="border-none bg-transparent px-6 py-12"
                />
              }
            />
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="size-4" />
              Factures
            </h2>
            <DataTable<InvoiceOut>
              columns={invoiceColumns}
              data={invoicesQuery.data ?? []}
              getRowId={(row) => row.id}
              isLoading={invoicesQuery.isFetching}
              error={
                invoicesQuery.isError
                  ? invoicesQuery.error instanceof ApiError
                    ? invoicesQuery.error.message
                    : "Erreur inconnue."
                  : null
              }
              onRetry={() => void invoicesQuery.refetch()}
              emptyState={
                <EmptyState
                  icon={FileText}
                  title="Aucune facture"
                  description="Une facture est émise automatiquement à chaque paiement validé. Les factures ne sont pas encore proposées en PDF."
                  className="border-none bg-transparent px-6 py-12"
                />
              }
            />
          </section>
        </>
      )}
    </motion.div>
  );
}

function SubscriptionHero({
  statusLabel,
  toneClass,
  statusKey,
  currentPeriodEnd,
  readOnlySince,
  suspendedSince,
  offerName,
  action,
}: {
  statusLabel: string;
  toneClass: string;
  statusKey: SubscriptionStatus;
  currentPeriodEnd: string;
  readOnlySince: string | null;
  suspendedSince: string | null;
  offerName?: string;
  action: ReactNode;
}) {
  const remaining = daysUntil(currentPeriodEnd);

  let copy: string;
  if (statusKey === "trial" || statusKey === "active") {
    copy =
      remaining >= 0
        ? `${statusKey === "trial" ? "Essai" : "Actif"} jusqu'au ${formatDate(currentPeriodEnd)} (${remaining} jour${remaining !== 1 ? "s" : ""} restant${remaining !== 1 ? "s" : ""}).`
        : `Expiré depuis le ${formatDate(currentPeriodEnd)}.`;
  } else if (statusKey === "read_only") {
    copy = readOnlySince
      ? `Lecture seule depuis le ${formatDate(readOnlySince)}. Consultation, filtres, exports et impressions restent disponibles — plus aucune saisie. Un règlement rouvre l'écriture immédiatement.`
      : "Lecture seule. Plus aucune saisie — un règlement rouvre l'écriture immédiatement.";
  } else if (statusKey === "suspended") {
    copy = suspendedSince
      ? `Suspendu depuis le ${formatDate(suspendedSince)}. Vos données sont intégralement conservées ; un export complet reste disponible sur demande.`
      : "Suspendu. Vos données sont intégralement conservées.";
  } else {
    copy = "Archivé.";
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/5">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium", toneClass)}>
              {statusLabel}
            </span>
            {offerName ? <span className="text-sm font-medium text-foreground">{offerName}</span> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{copy}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
