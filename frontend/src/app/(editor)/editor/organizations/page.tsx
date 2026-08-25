"use client";

/**
 * Liste des organisations côté éditeur (cahier des charges §13) : date
 * d'inscription, offre en cours, échéance, nombre d'utilisateurs — et
 * l'action de prolongation/suspension manuelle (§12.4). `GET
 * /editor/organizations` renvoie tout en une fois (pas de pagination
 * serveur) : le filtrage par nom/statut se fait donc côté client, sur la
 * liste complète.
 *
 * `offer_name` est toujours `null` côté backend à ce jour (lacune connue,
 * documentée dans `lib/api/types.ts`) — affiché en tiret plutôt que "null".
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Search, SlidersHorizontal } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { SubscriptionAdjustDialog } from "@/components/editor/subscription-adjust-dialog";
import { EmptyState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api/errors";
import { listOrganizations } from "@/lib/api/editor";
import type { OrganizationSummaryOut, SubscriptionStatus } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_TONE_CLASSES } from "@/lib/roles";
import { cn } from "@/lib/utils";

const STATUS_FILTER_ALL = "__all__";

export default function EditorOrganizationsPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_FILTER_ALL);

  const organizationsQuery = useQuery({
    queryKey: ["editor-organizations"],
    queryFn: () => listOrganizations(accessToken as string),
    enabled: Boolean(accessToken),
  });

  const organizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return organizations.filter((org) => {
      const matchesSearch = term === "" || org.name.toLowerCase().includes(term) || org.country_code.toLowerCase().includes(term);
      const matchesStatus = statusFilter === STATUS_FILTER_ALL || org.subscription_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [organizations, search, statusFilter]);

  function updateOrganization(organizationId: string, subscription: { status: SubscriptionStatus; current_period_end: string }) {
    queryClient.setQueryData<OrganizationSummaryOut[]>(["editor-organizations"], (prev) =>
      prev?.map((org) =>
        org.organization_id === organizationId
          ? { ...org, subscription_status: subscription.status, current_period_end: subscription.current_period_end }
          : org,
      ),
    );
  }

  const columns: ColumnDef<OrganizationSummaryOut, unknown>[] = [
    {
      id: "name",
      header: "Organisation",
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
    },
    {
      id: "country",
      header: "Pays",
      cell: ({ row }) => <span className="text-sm text-muted-foreground uppercase">{row.original.country_code}</span>,
    },
    {
      id: "created",
      header: "Inscrite le",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>,
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            SUBSCRIPTION_STATUS_TONE_CLASSES[row.original.subscription_status],
          )}
        >
          {SUBSCRIPTION_STATUS_LABELS[row.original.subscription_status]}
        </span>
      ),
    },
    {
      id: "offer",
      header: "Offre",
      // `offer_name` toujours `null` côté backend (lacune connue) — jamais "null" à l'écran.
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.offer_name ?? "—"}</span>,
    },
    {
      id: "period_end",
      header: "Expire le",
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.current_period_end)}</span>,
    },
    {
      id: "members",
      header: "Membres",
      cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.member_count}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <SubscriptionAdjustDialog
          accessToken={accessToken as string}
          organization={row.original}
          onAdjusted={(subscription) => updateOrganization(row.original.organization_id, subscription)}
          trigger={
            <Button variant="outline" size="sm">
              Ajuster
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Organisations</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Toutes les organisations de la plateforme, leur abonnement et leur nombre d&apos;utilisateurs (§13).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une organisation…"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>Tous les statuts</SelectItem>
            {(Object.entries(SUBSCRIPTION_STATUS_LABELS) as [SubscriptionStatus, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<OrganizationSummaryOut>
        columns={columns}
        data={filtered}
        getRowId={(row) => row.organization_id}
        isLoading={organizationsQuery.isFetching}
        error={
          organizationsQuery.isError
            ? organizationsQuery.error instanceof ApiError
              ? organizationsQuery.error.message
              : "Erreur inconnue."
            : null
        }
        onRetry={() => void organizationsQuery.refetch()}
        caption={`${filtered.length} organisation${filtered.length !== 1 ? "s" : ""}${filtered.length !== organizations.length ? ` sur ${organizations.length}` : ""}`}
        emptyState={
          <EmptyState
            icon={Building2}
            title="Aucune organisation"
            description={organizations.length > 0 ? "Aucune organisation ne correspond à ce filtre." : "Aucune organisation n'est encore inscrite sur la plateforme."}
            className="border-none bg-transparent px-6 py-16"
          />
        }
      />
    </div>
  );
}
