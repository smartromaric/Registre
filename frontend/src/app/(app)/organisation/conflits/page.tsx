"use client";

/**
 * Journal des conflits de synchronisation hors-ligne (cahier des charges
 * §11.3, PRODUCT.md §10.11) : une écriture hors-ligne rejetée par la fusion
 * champ par champ au profit d'une valeur déjà en place plus récente. Ne
 * résout rien automatiquement — juste consultable et marquable comme vu,
 * même principe que le journal d'audit. Réservé à l'ADMIN, même gate total
 * qu'`organisation/membres/page.tsx` (lu en premier pour ces conventions).
 *
 * Le conflit ne porte que `record_id`, pas `model_definition_id` — résoudre
 * le lien vers la fiche demanderait un aller-retour par ligne (N+1). On
 * affiche l'id de fiche en texte brut plutôt que de bloquer la page dessus,
 * choix explicitement laissé ouvert par le brief.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { GitMerge, Loader2, ShieldAlert } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/state-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/errors";
import { acknowledgeConflict, listConflicts } from "@/lib/api/sync";
import type { RecordFieldConflictOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 50;

function formatConflictValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

export default function SyncConflictsPage() {
  const { accessToken, currentOrganizationId, currentOrganization } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = currentOrganization?.my_role === "admin";
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const queryKey = ["sync-conflicts", currentOrganizationId, onlyUnreviewed, pageIndex];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      listConflicts(accessToken as string, currentOrganizationId as string, {
        onlyUnreviewed,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      }),
    enabled: Boolean(accessToken && currentOrganizationId) && isAdmin,
  });

  async function ack(conflict: RecordFieldConflictOut) {
    setPendingId(conflict.id);
    try {
      const updated = await acknowledgeConflict(accessToken as string, currentOrganizationId as string, conflict.id);
      if (onlyUnreviewed) {
        // Sort de la liste filtrée plutôt que d'y rester marqué "vu" — la
        // relecture serveur ferait pareil au prochain chargement.
        await queryClient.invalidateQueries({ queryKey: ["sync-conflicts", currentOrganizationId] });
      } else {
        queryClient.setQueryData<typeof query.data>(queryKey, (prev) =>
          prev ? { ...prev, items: prev.items.map((c) => (c.id === updated.id ? updated : c)) } : prev,
        );
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible de marquer ce conflit comme vu.");
    } finally {
      setPendingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            Conflits de synchronisation
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Journal des écritures hors-ligne rejetées par la fusion champ par champ (§11.3).
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Cet écran est réservé aux administrateurs de l&apos;organisation.
        </div>
      </div>
    );
  }

  const columns: ColumnDef<RecordFieldConflictOut, unknown>[] = [
    {
      id: "field",
      header: "Champ",
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.field_key}</span>,
    },
    {
      id: "record",
      header: "Fiche",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.record_id.slice(0, 8)}…</span>
      ),
    },
    {
      id: "kept",
      header: "Valeur conservée",
      cell: ({ row }) => (
        <div>
          <p className="text-foreground">{formatConflictValue(row.original.kept_value.value)}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(row.original.kept_at)}</p>
        </div>
      ),
    },
    {
      id: "rejected",
      header: "Valeur rejetée",
      cell: ({ row }) => (
        <div>
          <p className="text-foreground">{formatConflictValue(row.original.rejected_value.value)}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(row.original.rejected_at)}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) =>
        row.original.reviewed_at ? (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Vu
          </Badge>
        ) : (
          <Badge variant="outline" className="border-gold/30 bg-gold/15 text-gold-foreground">
            Non vu
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const conflict = row.original;
        const busy = pendingId === conflict.id;
        if (conflict.reviewed_at) return null;
        return (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void ack(conflict)}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Marquer comme vu
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            Conflits de synchronisation
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Écritures hors-ligne rejetées au profit d&apos;une valeur déjà plus récente (§11.3). Rien n&apos;est
            résolu automatiquement au-delà du dernier-écrit-l&apos;emporte déjà appliqué.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="only-unreviewed"
            checked={onlyUnreviewed}
            onCheckedChange={(checked) => {
              setOnlyUnreviewed(checked);
              setPageIndex(0);
            }}
          />
          <Label htmlFor="only-unreviewed" className="text-sm text-muted-foreground">
            Non vus uniquement
          </Label>
        </div>
      </div>

      <DataTable<RecordFieldConflictOut>
        columns={columns}
        data={query.data?.items ?? []}
        getRowId={(row) => row.id}
        isLoading={query.isFetching}
        error={query.isError ? (query.error instanceof ApiError ? query.error.message : "Erreur inconnue.") : null}
        onRetry={() => void query.refetch()}
        pagination={{ pageIndex, pageSize: PAGE_SIZE, total: query.data?.total ?? 0 }}
        onPageChange={setPageIndex}
        caption={query.data ? `${query.data.total} conflit${query.data.total !== 1 ? "s" : ""}` : undefined}
        emptyState={
          <EmptyState
            icon={GitMerge}
            title="Aucun conflit"
            description={
              onlyUnreviewed
                ? "Aucun conflit non vu — désactivez le filtre pour voir l'historique complet."
                : "Aucune écriture hors-ligne n'a jamais été rejetée dans cette organisation."
            }
            className="border-none bg-transparent px-6 py-16"
          />
        }
      />
    </div>
  );
}
