"use client";

/**
 * Catalogue de la plateforme (cahier des charges §12.1, §12.2, §13) : offres
 * et devises, gérées sans intervention technique. Deux onglets pour deux
 * ressources distinctes mais toujours consultées ensemble (les prix d'une
 * offre sont exprimés par devise).
 *
 * Liste toutes les entrées, actives ou non (`GET /editor/offers`,
 * `/editor/currencies` — distinctes du catalogue public
 * `lib/api/catalog.ts`, réservé aux organisations et limité aux entrées
 * actives) : désactiver une offre ou une devise ne doit pas la faire
 * disparaître de sa propre liste de gestion, sinon aucun moyen de la
 * retrouver pour la réactiver.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Star, Tags } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { CurrencyFormDialog } from "@/components/editor/currency-form-dialog";
import { OfferFormDialog } from "@/components/editor/offer-form-dialog";
import { EmptyState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/errors";
import { listCurrencies, listOffers } from "@/lib/api/editor";
import type { CurrencyOut, OfferOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatWithCurrencyFormat } from "@/lib/format";

export default function EditorCatalogPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

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
  const currencies = currenciesQuery.data ?? [];

  // La liste de gestion contient les entrées actives ET inactives : on
  // remplace/ajoute, jamais on ne retire — désactiver une offre ne doit pas
  // la faire disparaître de son propre écran de gestion.
  function upsertOffer(offer: OfferOut) {
    queryClient.setQueryData<OfferOut[]>(["editor-catalog-offers"], (prev) => {
      const base = prev ?? [];
      const exists = base.some((o) => o.id === offer.id);
      return exists ? base.map((o) => (o.id === offer.id ? offer : o)) : [...base, offer];
    });
  }

  function upsertCurrency(currency: CurrencyOut) {
    queryClient.setQueryData<CurrencyOut[]>(["editor-catalog-currencies"], (prev) => {
      const base = prev ?? [];
      const exists = base.some((c) => c.id === currency.id);
      return exists ? base.map((c) => (c.id === currency.id ? currency : c)) : [...base, currency];
    });
  }

  const offerColumns: ColumnDef<OfferOut, unknown>[] = [
    {
      id: "name",
      header: "Offre",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {row.original.name}
          {row.original.is_featured ? <Star className="size-3.5 fill-gold text-gold" aria-label="Mise en avant" /> : null}
        </span>
      ),
    },
    {
      id: "duration",
      header: "Durée",
      cell: ({ row }) => <span className="text-sm">{row.original.duration_months} mois</span>,
    },
    {
      id: "storage",
      header: "Stockage",
      cell: ({ row }) => <span className="text-sm">{row.original.storage_quota_gb} Go</span>,
    },
    {
      id: "users",
      header: "Utilisateurs",
      cell: ({ row }) => <span className="text-sm">{row.original.user_quota ?? "Illimité"}</span>,
    },
    {
      id: "prices",
      header: "Prix",
      cell: ({ row }) => {
        const entries = Object.entries(row.original.prices);
        if (entries.length === 0) return <span className="text-sm text-muted-foreground">Aucun prix réglé</span>;
        return (
          <span className="text-sm text-muted-foreground">
            {entries
              .map(([code, amount]) => {
                const currency = currencies.find((c) => c.code === code);
                return currency ? formatWithCurrencyFormat(amount, currency) : `${amount} ${code}`;
              })
              .join(" · ")}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Désactivée
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <OfferFormDialog
          accessToken={accessToken as string}
          currencies={currencies}
          initialValue={row.original}
          onSaved={upsertOffer}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${row.original.name}`}>
              <Pencil className="size-3.5" />
            </Button>
          }
        />
      ),
    },
  ];

  const currencyColumns: ColumnDef<CurrencyOut, unknown>[] = [
    { id: "code", header: "Code", cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    {
      id: "format",
      header: "Format d'affichage",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.display_format} — ex. {formatWithCurrencyFormat(12345, row.original)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Désactivée
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <CurrencyFormDialog
          accessToken={accessToken as string}
          initialValue={row.original}
          onSaved={upsertCurrency}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${row.original.code}`}>
              <Pencil className="size-3.5" />
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Catalogue</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Offres et devises de la plateforme — aucune fonctionnalité n&apos;est réservée à une offre, seuls la
            durée, le stockage et le nombre d&apos;utilisateurs varient (§12.1).
          </p>
        </div>
      </div>

      <Tabs defaultValue="offers">
        <TabsList>
          <TabsTrigger value="offers">Offres</TabsTrigger>
          <TabsTrigger value="currencies">Devises</TabsTrigger>
        </TabsList>

        <TabsContent value="offers" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <OfferFormDialog
              accessToken={accessToken as string}
              currencies={currencies}
              onSaved={upsertOffer}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Nouvelle offre
                </Button>
              }
            />
          </div>
          <DataTable<OfferOut>
            columns={offerColumns}
            data={offersQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={offersQuery.isFetching}
            error={offersQuery.isError ? (offersQuery.error instanceof ApiError ? offersQuery.error.message : "Erreur inconnue.") : null}
            onRetry={() => void offersQuery.refetch()}
            caption={offersQuery.data ? `${offersQuery.data.length} offre${offersQuery.data.length !== 1 ? "s" : ""}` : undefined}
            emptyState={
              <EmptyState
                icon={Tags}
                title="Aucune offre"
                description="Créez une première offre pour permettre aux organisations de s'abonner."
                className="border-none bg-transparent px-6 py-16"
              />
            }
          />
        </TabsContent>

        <TabsContent value="currencies" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <CurrencyFormDialog
              accessToken={accessToken as string}
              onSaved={upsertCurrency}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Nouvelle devise
                </Button>
              }
            />
          </div>
          <DataTable<CurrencyOut>
            columns={currencyColumns}
            data={currencies}
            getRowId={(row) => row.id}
            isLoading={currenciesQuery.isFetching}
            error={
              currenciesQuery.isError
                ? currenciesQuery.error instanceof ApiError
                  ? currenciesQuery.error.message
                  : "Erreur inconnue."
                : null
            }
            onRetry={() => void currenciesQuery.refetch()}
            caption={`${currencies.length} devise${currencies.length !== 1 ? "s" : ""}`}
            emptyState={
              <EmptyState
                icon={Tags}
                title="Aucune devise"
                description="Ajoutez au moins une devise pour fixer des prix d'offre."
                className="border-none bg-transparent px-6 py-16"
              />
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
