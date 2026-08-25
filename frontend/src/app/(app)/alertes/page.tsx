"use client";

/**
 * Écran « Alertes » (cahier des charges §8, PRODUCT.md §10.2) — la contrepartie
 * visible du moteur d'échéances. Même forme que
 * `organisation/conflits/page.tsx` : liste, filtres, action par ligne.
 *
 * **Libellé des alertes.** `AlertOut` ne porte aucun texte lisible : seulement
 * `source_type`, `source_id` et `palier`. Et `source_id` désigne un
 * `RecordDeadline` / `StockLevel` / `StockLot`, jamais une fiche — aucune route
 * exposée ne permet d'en remonter jusqu'à la fiche concernée. Le seul texte
 * réellement disponible est celui de la notification liée
 * (`NotificationOut.related_alert_id`), écrit par le backend : c'est lui qu'on
 * affiche, et rien n'est affiché quand il manque. Aucun lien vers une fiche
 * n'est proposé ici : il serait fabriqué, et finirait en 404.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { BellRing, CalendarClock, Check } from "lucide-react";

import { PostponeAlertDialog } from "@/components/alerts/postpone-alert-dialog";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { acknowledgeAlert, listAlerts, listNotifications } from "@/lib/api/alerts";
import { ApiError } from "@/lib/api/errors";
import type { AlertOut, AlertStatus, NotificationOut } from "@/lib/api/types";
import {
  ALERT_STATUS_LABELS,
  ALERT_STATUS_TONE_CLASSES,
  alertSourceLabel,
  canActOnAlert,
  describePalier,
} from "@/lib/alert-format";
import { useAuth } from "@/lib/auth/auth-context";
import { DUE_DATE_TONE_CLASSES } from "@/lib/due-date-status";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES: AlertStatus[] = ["emitted", "acknowledged", "postponed", "resolved"];
/** Radix `Select` n'accepte pas la chaîne vide comme valeur : sentinelle. */
const ANY_STATUS = "all";

function ToneBadge({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export default function AlertesPage() {
  const { accessToken, currentOrganizationId, currentOrganization, user } = useAuth();
  const queryClient = useQueryClient();
  const [mineOnly, setMineOnly] = useState(true);
  const [status, setStatus] = useState<AlertStatus | typeof ANY_STATUS>(ANY_STATUS);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toPostpone, setToPostpone] = useState<AlertOut | null>(null);

  const alertsKey = ["alerts", currentOrganizationId, mineOnly, status];
  const alertsQuery = useQuery({
    queryKey: alertsKey,
    queryFn: () =>
      listAlerts(accessToken as string, currentOrganizationId as string, {
        mineOnly,
        status: status === ANY_STATUS ? undefined : status,
      }),
    enabled: Boolean(accessToken && currentOrganizationId),
  });

  // Même clé que la cloche de l'en-tête : une seule copie en cache, un seul
  // appel réseau pour les deux surfaces.
  const notificationsQuery = useQuery({
    queryKey: ["notifications", currentOrganizationId],
    queryFn: () => listNotifications(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
  });

  /** Seul chemin honnête vers un libellé lisible : la notification que le
   * backend a écrite pour cette alerte. Absente pour les alertes adressées à
   * quelqu'un d'autre — leurs notifications ne nous sont pas exposées. */
  const notificationByAlert = useMemo(() => {
    const map = new Map<string, NotificationOut>();
    for (const notification of notificationsQuery.data ?? []) {
      if (notification.related_alert_id) map.set(notification.related_alert_id, notification);
    }
    return map;
  }, [notificationsQuery.data]);

  const role = currentOrganization?.my_role ?? null;
  const userId = user?.id ?? null;

  async function acknowledge(alert: AlertOut) {
    setPendingId(alert.id);
    try {
      await acknowledgeAlert(accessToken as string, currentOrganizationId as string, alert.id);
      await queryClient.invalidateQueries({ queryKey: ["alerts", currentOrganizationId] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Impossible d'acquitter cette alerte.");
    } finally {
      setPendingId(null);
    }
  }

  const columns: ColumnDef<AlertOut, unknown>[] = [
    {
      id: "alerte",
      header: "Alerte",
      cell: ({ row }) => {
        const alert = row.original;
        const notification = notificationByAlert.get(alert.id);
        return (
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium text-foreground">
              {notification ? notification.title : alertSourceLabel(alert.source_type)}
            </p>
            {notification ? (
              <p className="text-xs text-muted-foreground">{notification.body}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Aucune notification liée à votre compte — détail indisponible.
              </p>
            )}
            <p className="text-[0.7rem] text-muted-foreground">{alertSourceLabel(alert.source_type)}</p>
          </div>
        );
      },
    },
    {
      id: "palier",
      header: "Palier",
      cell: ({ row }) => {
        const { tone, label } = describePalier(row.original.palier);
        return <ToneBadge className={DUE_DATE_TONE_CLASSES[tone]}>{label}</ToneBadge>;
      },
    },
    {
      id: "statut",
      header: "Statut",
      cell: ({ row }) => {
        const alert = row.original;
        return (
          <div className="space-y-0.5">
            <ToneBadge className={ALERT_STATUS_TONE_CLASSES[alert.status]}>
              {ALERT_STATUS_LABELS[alert.status]}
            </ToneBadge>
            {alert.status === "postponed" && alert.postponed_until ? (
              <p className="text-[0.7rem] text-muted-foreground">
                Relance le {formatDate(alert.postponed_until)}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "signalee",
      header: "Signalée le",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const alert = row.original;
        // Miroir exact de `AlertService._check_can_touch` : on n'affiche jamais
        // un bouton qui reviendrait en 403.
        const canAct = canActOnAlert(alert, userId, role);
        const canAcknowledge = canAct && (alert.status === "emitted" || alert.status === "postponed");
        const canPostpone = canAct && alert.status !== "resolved";

        if (!canAcknowledge && !canPostpone) {
          return (
            <span
              className="text-xs text-muted-foreground"
              title={
                canAct
                  ? "Cette alerte est déjà traitée."
                  : "Cette alerte est adressée à quelqu'un d'autre : seuls son destinataire, un administrateur ou un gestionnaire peuvent agir dessus."
              }
            >
              —
            </span>
          );
        }

        return (
          <div className="flex justify-end gap-1.5">
            {canAcknowledge ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pendingId === alert.id}
                onClick={() => void acknowledge(alert)}
              >
                <Check className="size-3.5" />
                Acquitter
              </Button>
            ) : null}
            {canPostpone ? (
              <Button variant="ghost" size="sm" onClick={() => setToPostpone(alert)}>
                <CalendarClock className="size-3.5" />
                Reporter
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const alerts = alertsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Alertes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ce que le moteur a signalé : échéance proche, stock sous seuil, lot bientôt périmé (§8).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="mine-only" checked={mineOnly} onCheckedChange={setMineOnly} />
            <Label htmlFor="mine-only" className="text-sm text-muted-foreground">
              Seulement les miennes
            </Label>
          </div>
          <Select value={status} onValueChange={(next) => setStatus(next as AlertStatus | typeof ANY_STATUS)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_STATUS}>Tous les statuts</SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ALERT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable<AlertOut>
        columns={columns}
        data={alerts}
        getRowId={(row) => row.id}
        isLoading={alertsQuery.isFetching}
        error={
          alertsQuery.isError
            ? alertsQuery.error instanceof ApiError
              ? alertsQuery.error.message
              : "Erreur inconnue."
            : null
        }
        onRetry={() => void alertsQuery.refetch()}
        caption={alerts.length > 0 ? `${alerts.length} alerte${alerts.length !== 1 ? "s" : ""}` : undefined}
        emptyState={
          <EmptyState
            icon={BellRing}
            title="Aucune alerte"
            description={
              mineOnly
                ? "Rien ne vous est adressé pour l'instant. Le moteur balaie les échéances chaque nuit."
                : "Aucune alerte pour cette organisation avec ce filtre."
            }
            className="border-none bg-transparent px-6 py-16"
          />
        }
      />

      <PostponeAlertDialog
        alert={toPostpone}
        open={toPostpone !== null}
        onOpenChange={(open) => {
          if (!open) setToPostpone(null);
        }}
        accessToken={accessToken as string}
        organizationId={currentOrganizationId as string}
        onPostponed={() => {
          void queryClient.invalidateQueries({ queryKey: ["alerts", currentOrganizationId] });
        }}
      />
    </div>
  );
}
