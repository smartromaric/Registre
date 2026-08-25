"use client";

/**
 * Vue d'ensemble de l'espace éditeur (cahier des charges §13) : la
 * répartition des organisations par état d'abonnement, la taille de la file
 * de règlements à traiter, et le déclencheur manuel du balayage de cycle de
 * vie (§12.3) — le backend n'a pas encore de tâche planifiée pour l'exécuter
 * seul, ce bouton en tient lieu.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, PlayCircle, Receipt, Tags, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { StatTile } from "@/components/dashboard/stat-tile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { listDeclaredPayments, listOrganizations, runLifecycleScan } from "@/lib/api/editor";
import type { LifecycleTransition } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/roles";

export default function EditorOverviewPage() {
  const reduceMotion = useReducedMotion();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [scanConfirmOpen, setScanConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<LifecycleTransition[] | null>(null);

  const organizationsQuery = useQuery({
    queryKey: ["editor-organizations"],
    queryFn: () => listOrganizations(accessToken as string),
    enabled: Boolean(accessToken),
  });
  const paymentsQuery = useQuery({
    queryKey: ["editor-payments-queue"],
    queryFn: () => listDeclaredPayments(accessToken as string),
    enabled: Boolean(accessToken),
  });

  const organizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data]);
  const counts = useMemo(() => {
    const byStatus = { trial: 0, active: 0, read_only: 0, suspended: 0, archived: 0 } as Record<string, number>;
    for (const org of organizations) byStatus[org.subscription_status] += 1;
    return byStatus;
  }, [organizations]);

  const scanMutation = useMutation({
    mutationFn: () => runLifecycleScan(accessToken as string),
    onSuccess: (result) => {
      setLastResult(result.transitions);
      setScanConfirmOpen(false);
      if (result.transitions.length === 0) {
        toast.success("Scan terminé — aucune organisation n'a changé d'état.");
      } else {
        toast.success(`Scan terminé — ${result.transitions.length} organisation${result.transitions.length !== 1 ? "s" : ""} mise${result.transitions.length !== 1 ? "s" : ""} à jour.`);
      }
      void queryClient.invalidateQueries({ queryKey: ["editor-organizations"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Le scan de cycle de vie a échoué.");
      setScanConfirmOpen(false);
    },
  });

  const orgById = useMemo(() => new Map(organizations.map((o) => [o.organization_id, o])), [organizations]);

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Vue d&apos;ensemble</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pilotage de la plateforme — abonnements, règlements et catalogue (§13).
        </p>
      </div>

      {organizationsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Organisations" value={organizations.length} caption="Toutes confondues" />
          <StatTile label={SUBSCRIPTION_STATUS_LABELS.trial} value={counts.trial} caption="Essai en cours" />
          <StatTile label={SUBSCRIPTION_STATUS_LABELS.active} value={counts.active} caption="Abonnement payant" />
          <StatTile label={SUBSCRIPTION_STATUS_LABELS.read_only} value={counts.read_only} caption="À relancer" />
          <StatTile label={SUBSCRIPTION_STATUS_LABELS.suspended} value={counts.suspended} caption="Accès coupé" />
          <StatTile
            label="Règlements en attente"
            value={paymentsQuery.data?.length ?? 0}
            caption={paymentsQuery.data && paymentsQuery.data.length > 0 ? "À vérifier" : "File vide"}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <QuickLinkCard href="/editor/organizations" icon={Building2} title="Organisations" description="Liste complète, abonnement, ajustement manuel." />
        <QuickLinkCard href="/editor/payments" icon={Receipt} title="Règlements" description="Vérifier et valider la file des paiements déclarés." />
        <QuickLinkCard href="/editor/catalog" icon={Tags} title="Catalogue" description="Offres, quotas, prix par devise et devises acceptées." />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 ring-1 ring-foreground/5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-heading text-base font-medium text-foreground">Cycle de vie des abonnements</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Essai → lecture seule → suspendu → archivé, selon le temps écoulé depuis l&apos;échéance (§12.3). Le
              backend n&apos;a pas encore de tâche planifiée pour ce balayage — déclenchez-le manuellement en
              attendant.
            </p>
          </div>
          <AlertDialog open={scanConfirmOpen} onOpenChange={setScanConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <PlayCircle className="size-4" />
                Lancer le scan
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Lancer le balayage de cycle de vie ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Fait avancer l&apos;état de chaque organisation selon le temps réellement écoulé (essai expiré →
                  lecture seule, lecture seule expirée → suspendu, etc.). Sans effet sur les organisations déjà à
                  jour.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={scanMutation.isPending}>Annuler</AlertDialogCancel>
                <AlertDialogAction disabled={scanMutation.isPending} onClick={() => scanMutation.mutate()}>
                  Lancer le scan
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {lastResult ? (
          <div className="mt-4 border-t border-border/70 pt-4">
            <p className="mb-2 text-sm font-medium text-foreground">
              Dernier scan — {lastResult.length} transition{lastResult.length !== 1 ? "s" : ""}
            </p>
            {lastResult.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune organisation n&apos;a changé d&apos;état.</p>
            ) : (
              <ul className="space-y-1.5">
                {lastResult.map((t, i) => (
                  <li key={`${t.organization_id}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{orgById.get(t.organization_id)?.name ?? t.organization_id}</span>
                    <span className="text-muted-foreground">
                      {SUBSCRIPTION_STATUS_LABELS[t.from]} → {SUBSCRIPTION_STATUS_LABELS[t.to]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function QuickLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </span>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        {title}
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </Link>
  );
}
