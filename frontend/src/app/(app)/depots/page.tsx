"use client";

/**
 * Écran de gestion des dépôts (cahier des charges §7.2) — une organisation
 * peut en déclarer autant qu'elle veut ; les quantités de stock y sont
 * toujours rattachées. Liste + création/modification, pas de suppression :
 * un dépôt se désactive (`is_active`) plutôt que de disparaître avec son
 * historique de mouvements.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Warehouse } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DepotFormDialog } from "@/components/stock/depot-form-dialog";
import { EmptyState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { listDepots } from "@/lib/api/stock";
import type { DepotOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

export default function DepotsPage() {
  const { accessToken, currentOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["depots", currentOrganizationId];

  const query = useQuery({
    queryKey,
    queryFn: () => listDepots(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
  });

  function upsertDepot(depot: DepotOut) {
    queryClient.setQueryData<DepotOut[]>(queryKey, (prev) => {
      if (!prev) return [depot];
      const exists = prev.some((d) => d.id === depot.id);
      return exists ? prev.map((d) => (d.id === depot.id ? depot : d)) : [...prev, depot];
    });
  }

  const columns: ColumnDef<DepotOut, unknown>[] = [
    {
      id: "name",
      header: "Nom",
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      id: "address",
      header: "Adresse",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.address ?? "—"}</span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Actif
          </Badge>
        ) : (
          <Badge variant="secondary">Inactif</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DepotFormDialog
          organizationId={currentOrganizationId as string}
          accessToken={accessToken as string}
          initialValue={row.original}
          onSaved={upsertDepot}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${row.original.name}`}>
              <Pencil className="size-3.5" />
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Dépôts</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Les quantités de stock sont toujours rattachées à un dépôt (§7.2).
          </p>
        </div>
        <DepotFormDialog
          organizationId={currentOrganizationId as string}
          accessToken={accessToken as string}
          onSaved={upsertDepot}
          trigger={
            <Button>
              <Plus className="size-4" />
              Nouveau dépôt
            </Button>
          }
        />
      </div>

      <DataTable<DepotOut>
        columns={columns}
        data={query.data ?? []}
        getRowId={(row) => row.id}
        isLoading={query.isFetching}
        error={query.isError ? (query.error instanceof ApiError ? query.error.message : "Erreur inconnue.") : null}
        onRetry={() => void query.refetch()}
        caption={query.data ? `${query.data.length} dépôt${query.data.length !== 1 ? "s" : ""}` : undefined}
        emptyState={
          <EmptyState
            icon={Warehouse}
            title="Aucun dépôt"
            description="Créez votre premier dépôt pour commencer à suivre le stock."
            action={
              <DepotFormDialog
                organizationId={currentOrganizationId as string}
                accessToken={accessToken as string}
                onSaved={upsertDepot}
                trigger={
                  <Button>
                    <Plus className="size-4" />
                    Nouveau dépôt
                  </Button>
                }
              />
            }
            className="border-none bg-transparent px-6 py-16"
          />
        }
      />
    </div>
  );
}
