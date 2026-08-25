"use client";

/**
 * La liste exacte derrière chaque indicateur d'anomalie (cahier des charges
 * §10.5 : "un chiffre qui ne mène nulle part n'a pas sa place"). Une seule
 * boîte de dialogue, son contenu dépend de `kind` — chaque variante appelle
 * la route de liste qui partage exactement le même filtrage que le compteur
 * qu'elle détaille (`lib/api/dashboards.ts`).
 *
 * Chaque ligne ouvre la fiche via la redirection courte `/r/{recordId}`
 * (voir `app/(app)/r/[recordId]/page.tsx`) plutôt que la route complète
 * `/models/{modelId}/records/{recordId}` — les indicateurs "sous seuil" et
 * "péremption" ne renvoient que `model_name` (une chaîne), pas l'identifiant
 * du modèle ; la redirection courte évite d'avoir à le résoudre en plus.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleCheck } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/state-views";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import { listDeadlineHits, listExpiringLotHits, listUnderstockHits } from "@/lib/api/dashboards";
import type { DeadlineHitOut, ExpiringLotHitOut, UnderstockHitOut } from "@/lib/api/types";
import { computeDueDateStatus, DUE_DATE_TONE_CLASSES, type DueDateTone } from "@/lib/due-date-status";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DrilldownKind = "overdue" | "upcoming" | "understock" | "expiring";

const PAGE_SIZE = 20;

const TITLES: Record<DrilldownKind, string> = {
  overdue: "Échéances en retard",
  upcoming: "Échéances des 30 prochains jours",
  understock: "Articles sous seuil",
  expiring: "Lots proches de la péremption",
};

export interface DrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DrilldownKind | null;
  organizationId: string;
  accessToken: string;
  modelId?: string | null;
  depotId?: string | null;
  site?: string | null;
}

export function DrilldownDialog({
  open,
  onOpenChange,
  kind,
  organizationId,
  accessToken,
  modelId,
  depotId,
  site,
}: DrilldownDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kind ? TITLES[kind] : ""}</DialogTitle>
          <DialogDescription>La liste exacte derrière ce chiffre — ouvrez une fiche pour agir.</DialogDescription>
        </DialogHeader>
        {kind === "overdue" || kind === "upcoming" ? (
          <DeadlineHitsTable
            key={`${kind}-${modelId ?? ""}-${site ?? ""}`}
            organizationId={organizationId}
            accessToken={accessToken}
            kind={kind}
            modelId={modelId}
            site={site}
          />
        ) : kind === "understock" ? (
          <UnderstockHitsTable
            key={`understock-${modelId ?? ""}-${depotId ?? ""}`}
            organizationId={organizationId}
            accessToken={accessToken}
            modelId={modelId}
            depotId={depotId}
          />
        ) : kind === "expiring" ? (
          <ExpiringLotsTable
            key={`expiring-${modelId ?? ""}-${depotId ?? ""}`}
            organizationId={organizationId}
            accessToken={accessToken}
            modelId={modelId}
            depotId={depotId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ToneBadge({ tone, label }: { tone: DueDateTone; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        DUE_DATE_TONE_CLASSES[tone],
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

function RecordLink({ recordId, title }: { recordId: string; title: string }) {
  return (
    <Link href={`/r/${recordId}`} className="font-medium text-foreground hover:text-primary hover:underline">
      {title}
    </Link>
  );
}

function DeadlineHitsTable({
  organizationId,
  accessToken,
  kind,
  modelId,
  site,
}: {
  organizationId: string;
  accessToken: string;
  kind: "overdue" | "upcoming";
  modelId?: string | null;
  site?: string | null;
}) {
  const [pageIndex, setPageIndex] = useState(0);

  const query = useQuery({
    queryKey: ["dashboard-deadlines", organizationId, kind, modelId, site, pageIndex],
    queryFn: () =>
      listDeadlineHits(accessToken, organizationId, {
        status: kind,
        modelId: modelId ?? undefined,
        site: site ?? undefined,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<DeadlineHitOut, unknown>[]>(() => {
    const cols: ColumnDef<DeadlineHitOut, unknown>[] = [
      {
        id: "record_title",
        header: "Fiche",
        cell: ({ row }) => <RecordLink recordId={row.original.record_id} title={row.original.record_title} />,
      },
    ];
    if (!modelId) {
      cols.push({
        id: "model_name",
        header: "Modèle",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.model_name}</span>,
      });
    }
    cols.push(
      { id: "field_label", header: "Champ", cell: ({ row }) => row.original.field_label },
      { id: "due_date", header: "Échéance", cell: ({ row }) => formatDate(row.original.due_date) },
      {
        id: "state",
        header: "État",
        cell: ({ row }) => {
          // Même règle de tonalité/libellé que partout ailleurs dans
          // l'application (`field-value.tsx`, `record-columns.tsx`) — jamais
          // une deuxième échelle de couleurs pour la même notion d'échéance.
          // `days_overdue` seul ne suffit pas à graduer "à venir" (toujours
          // <= 0 pour cette liste) : on repart de la date elle-même.
          const status = computeDueDateStatus(row.original.due_date);
          return <ToneBadge tone={status.tone} label={status.label} />;
        },
      },
    );
    return cols;
  }, [modelId]);

  return (
    <DataTable<DeadlineHitOut>
      columns={columns}
      data={query.data?.items ?? []}
      getRowId={(row) => `${row.record_id}-${row.field_key}`}
      isLoading={query.isFetching}
      error={query.isError ? (query.error instanceof ApiError ? query.error.message : "Erreur inconnue.") : null}
      onRetry={() => void query.refetch()}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, total: query.data?.total ?? 0 }}
      onPageChange={setPageIndex}
      caption={query.data ? `${query.data.total} échéance${query.data.total !== 1 ? "s" : ""}` : undefined}
      emptyState={
        <EmptyState
          icon={CircleCheck}
          title={kind === "overdue" ? "Aucune échéance en retard" : "Rien à venir"}
          description="Aucune échéance ne correspond à ce périmètre."
          className="border-none bg-transparent px-6 py-12"
        />
      }
    />
  );
}

function UnderstockHitsTable({
  organizationId,
  accessToken,
  modelId,
  depotId,
}: {
  organizationId: string;
  accessToken: string;
  modelId?: string | null;
  depotId?: string | null;
}) {
  const [pageIndex, setPageIndex] = useState(0);

  const query = useQuery({
    queryKey: ["dashboard-understock", organizationId, modelId, depotId, pageIndex],
    queryFn: () =>
      listUnderstockHits(accessToken, organizationId, {
        modelId: modelId ?? undefined,
        depotId: depotId ?? undefined,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<UnderstockHitOut, unknown>[]>(() => {
    const cols: ColumnDef<UnderstockHitOut, unknown>[] = [
      {
        id: "record_title",
        header: "Fiche",
        cell: ({ row }) => <RecordLink recordId={row.original.record_id} title={row.original.record_title} />,
      },
    ];
    if (!modelId) {
      cols.push({
        id: "model_name",
        header: "Modèle",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.model_name}</span>,
      });
    }
    cols.push(
      { id: "variant_label", header: "Variante", cell: ({ row }) => row.original.variant_label },
      { id: "depot_name", header: "Dépôt", cell: ({ row }) => row.original.depot_name },
      {
        id: "quantity",
        header: "Quantité / seuil",
        cell: ({ row }) => <ToneBadge tone="overdue" label={`${row.original.quantity} / ${row.original.threshold}`} />,
      },
    );
    return cols;
  }, [modelId]);

  return (
    <DataTable<UnderstockHitOut>
      columns={columns}
      data={query.data?.items ?? []}
      getRowId={(row) => `${row.record_id}-${row.variant_id}-${row.depot_id}`}
      isLoading={query.isFetching}
      error={query.isError ? (query.error instanceof ApiError ? query.error.message : "Erreur inconnue.") : null}
      onRetry={() => void query.refetch()}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, total: query.data?.total ?? 0 }}
      onPageChange={setPageIndex}
      caption={query.data ? `${query.data.total} article${query.data.total !== 1 ? "s" : ""} sous seuil` : undefined}
      emptyState={
        <EmptyState
          icon={CircleCheck}
          title="Aucun article sous seuil"
          description="Tous les articles sont au-dessus de leur seuil sur ce périmètre."
          className="border-none bg-transparent px-6 py-12"
        />
      }
    />
  );
}

function ExpiringLotsTable({
  organizationId,
  accessToken,
  modelId,
  depotId,
}: {
  organizationId: string;
  accessToken: string;
  modelId?: string | null;
  depotId?: string | null;
}) {
  const [pageIndex, setPageIndex] = useState(0);

  const query = useQuery({
    queryKey: ["dashboard-expiring-lots", organizationId, modelId, depotId, pageIndex],
    queryFn: () =>
      listExpiringLotHits(accessToken, organizationId, {
        modelId: modelId ?? undefined,
        depotId: depotId ?? undefined,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<ExpiringLotHitOut, unknown>[]>(() => {
    const cols: ColumnDef<ExpiringLotHitOut, unknown>[] = [
      {
        id: "record_title",
        header: "Fiche",
        cell: ({ row }) => <RecordLink recordId={row.original.record_id} title={row.original.record_title} />,
      },
    ];
    if (!modelId) {
      cols.push({
        id: "model_name",
        header: "Modèle",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.model_name}</span>,
      });
    }
    cols.push(
      { id: "variant_label", header: "Variante", cell: ({ row }) => row.original.variant_label },
      { id: "depot_name", header: "Dépôt", cell: ({ row }) => row.original.depot_name },
      { id: "lot_number", header: "Lot", cell: ({ row }) => row.original.lot_number },
      {
        id: "expiry_date",
        header: "Péremption",
        // Un lot qui expire est conceptuellement une échéance : même calcul
        // de tonalité que le reste de l'application (lib/due-date-status.ts),
        // pas une nouvelle règle de couleur propre au tableau de bord.
        cell: ({ row }) => {
          const status = computeDueDateStatus(row.original.expiry_date);
          return (
            <div className="flex flex-col gap-1">
              <ToneBadge tone={status.tone} label={status.label} />
              <span className="text-xs text-muted-foreground">{formatDate(row.original.expiry_date)}</span>
            </div>
          );
        },
      },
      {
        id: "remaining_quantity",
        header: "Quantité restante",
        cell: ({ row }) => row.original.remaining_quantity,
      },
    );
    return cols;
  }, [modelId]);

  return (
    <DataTable<ExpiringLotHitOut>
      columns={columns}
      data={query.data?.items ?? []}
      getRowId={(row) => `${row.record_id}-${row.variant_id}-${row.lot_number}`}
      isLoading={query.isFetching}
      error={query.isError ? (query.error instanceof ApiError ? query.error.message : "Erreur inconnue.") : null}
      onRetry={() => void query.refetch()}
      pagination={{ pageIndex, pageSize: PAGE_SIZE, total: query.data?.total ?? 0 }}
      onPageChange={setPageIndex}
      caption={query.data ? `${query.data.total} lot${query.data.total !== 1 ? "s" : ""} proche${query.data.total !== 1 ? "s" : ""} de la péremption` : undefined}
      emptyState={
        <EmptyState
          icon={CircleCheck}
          title="Aucun lot proche de la péremption"
          description="Aucun lot ne correspond à ce périmètre."
          className="border-none bg-transparent px-6 py-12"
        />
      }
    />
  );
}
