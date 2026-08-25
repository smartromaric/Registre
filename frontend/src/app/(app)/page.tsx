"use client";

/**
 * Page d'accueil de l'application — le tableau de bord (cahier des charges
 * §10). Par défaut répond à une seule question : "qu'est-ce qui demande mon
 * attention aujourd'hui ?" (§10.1). Un bandeau de modèles permet de focaliser
 * tout le tableau de bord sur un seul modèle (§10.2), avec des indicateurs et
 * des graphiques propres à sa nature (§10.3). Le périmètre peut être
 * enregistré, retrouvé et épinglé comme page d'accueil (§10.4).
 *
 * Si l'utilisateur a épinglé un tableau de bord, cette page charge son
 * périmètre au montage plutôt que la vue globale. Le périmètre effectif
 * (`scope`) est un état **dérivé** — le choix explicite de l'utilisateur s'il
 * existe, sinon le tableau de bord épinglé, sinon "Tout" — plutôt que
 * recopié depuis la requête épinglée par un effet : même principe que
 * `currentOrganizationId` dans `lib/auth/auth-context.tsx` ("dérivé, pas
 * synchronisé par un effet : rien à désynchroniser, rien à recaler après
 * coup"). Dès la première interaction de l'utilisateur, le périmètre explicite
 * prend le dessus pour de bon.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutDashboard, Pin, Save } from "lucide-react";

import { AssetDashboardView } from "@/components/dashboard/asset-view";
import { DrilldownDialog, type DrilldownKind } from "@/components/dashboard/drilldown-dialog";
import { GlobalDashboardView } from "@/components/dashboard/global-view";
import { ModelPicker } from "@/components/dashboard/model-picker";
import { SaveDashboardDialog } from "@/components/dashboard/save-dashboard-dialog";
import { SavedDashboardsMenu } from "@/components/dashboard/saved-dashboards-menu";
import { StockDashboardView } from "@/components/dashboard/stock-view";
import { DEFAULT_DASHBOARD_SCOPE, PERIOD_LABELS, type DashboardScopeState } from "@/components/dashboard/types";
import { EmptyState, ErrorState } from "@/components/state-views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { getDashboard, getPinnedDashboard } from "@/lib/api/dashboards";
import { listModelDefinitions } from "@/lib/api/model-definitions";
import { listDepots } from "@/lib/api/stock";
import type { DashboardPeriod, SavedDashboardOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * Coquille fine : ne porte aucun état, seulement le `key={currentOrganizationId}`
 * qui force un remontage complet de `DashboardContent` à chaque changement
 * d'organisation — même principe que `key={siteFieldVersion}`/`key={model.id}`
 * plus bas et dans `models/[modelId]/settings/page.tsx`. Sans ce remontage,
 * `explicitScope` (modèle/dépôt/site focalisés) survivait au changement
 * d'organisation : le tableau de bord de l'organisation B s'affichait filtré
 * sur un `model_definition_id`/`depot_id` de l'organisation A, invisible et
 * sans correspondance côté B — ni le tableau de bord épinglé de B ni la vue
 * "Tout" ne reprenaient jamais la main tant que l'utilisateur ne touchait pas
 * un filtre à la main.
 */
export default function AppHomePage() {
  const { currentOrganizationId } = useAuth();
  return <DashboardContent key={currentOrganizationId ?? "none"} />;
}

function DashboardContent() {
  const reduceMotion = useReducedMotion();
  const { accessToken, currentOrganizationId, currentOrganization, user } = useAuth();
  const queryClient = useQueryClient();
  const firstName = user?.full_name.split(" ")[0] ?? "";

  // `null` tant que l'utilisateur n'a pas touché au périmètre cette session —
  // voir `scope` plus bas, qui retombe alors sur le tableau de bord épinglé.
  const [explicitScope, setExplicitScope] = useState<DashboardScopeState | null>(null);
  // Incrémenté à chaque changement de périmètre déclenché par l'utilisateur
  // (modèle, tableau de bord chargé) pour forcer le champ "site" à se
  // réinitialiser sur sa nouvelle valeur — voir le commentaire sur `<Input>`.
  const [siteFieldVersion, setSiteFieldVersion] = useState(0);
  const [drilldown, setDrilldown] = useState<DrilldownKind | null>(null);

  // --- périmètre épinglé (§10.4) ----------------------------------------------------

  const pinnedQuery = useQuery({
    queryKey: ["dashboard-pinned", currentOrganizationId],
    queryFn: () => getPinnedDashboard(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
    retry: false,
  });

  const scope: DashboardScopeState = useMemo(() => {
    if (explicitScope) return explicitScope;
    if (pinnedQuery.data) {
      return {
        modelId: pinnedQuery.data.model_definition_id,
        depotId: pinnedQuery.data.depot_id,
        site: pinnedQuery.data.site ?? "",
        period: pinnedQuery.data.period,
      };
    }
    return DEFAULT_DASHBOARD_SCOPE;
  }, [explicitScope, pinnedQuery.data]);

  const isCurrentScopePinned = useMemo(() => {
    if (!pinnedQuery.data) return false;
    return (
      (pinnedQuery.data.model_definition_id ?? null) === scope.modelId &&
      (pinnedQuery.data.depot_id ?? null) === scope.depotId &&
      (pinnedQuery.data.site ?? "") === scope.site &&
      pinnedQuery.data.period === scope.period
    );
  }, [pinnedQuery.data, scope]);

  // --- filtre site (actif suivi) : texte libre débattu avant de recalculer ---------
  // Débattu depuis le gestionnaire d'événement (pas un effet) : le minuteur
  // n'appelle `setExplicitScope` qu'après la pause de saisie, jamais pendant
  // le rendu d'un effet.

  const siteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(siteDebounceRef.current ?? undefined), []);

  function handleSiteInputChange(value: string) {
    clearTimeout(siteDebounceRef.current ?? undefined);
    siteDebounceRef.current = setTimeout(() => {
      setExplicitScope({ ...scope, site: value });
    }, 400);
  }

  // --- modèles actifs (bandeau de focalisation, §10.2) ------------------------------

  const modelsQuery = useQuery({
    queryKey: ["model-definitions", currentOrganizationId],
    queryFn: () => listModelDefinitions(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
  });
  const activeModels = useMemo(() => (modelsQuery.data ?? []).filter((m) => !m.is_archived), [modelsQuery.data]);
  const focusedModel = useMemo(
    () => activeModels.find((m) => m.id === scope.modelId) ?? null,
    [activeModels, scope.modelId],
  );

  const depotsQuery = useQuery({
    queryKey: ["depots", currentOrganizationId],
    queryFn: () => listDepots(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId) && focusedModel?.nature === "stock_item",
  });

  // --- tableau de bord calculé (§10.1, §10.2, §10.3) --------------------------------

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", currentOrganizationId, scope.modelId, scope.depotId, scope.site, scope.period],
    queryFn: () =>
      getDashboard(accessToken as string, currentOrganizationId as string, {
        modelId: scope.modelId ?? undefined,
        depotId: scope.depotId ?? undefined,
        site: scope.site || undefined,
        period: scope.period,
      }),
    // Le tableau de bord épinglé (s'il existe) doit être connu avant le
    // premier appel, sous peine d'un aller-retour visible sur le périmètre
    // "Tout" — voir `scope` ci-dessus.
    enabled: Boolean(accessToken && currentOrganizationId) && !pinnedQuery.isLoading,
    placeholderData: keepPreviousData,
  });

  function selectModel(modelId: string | null) {
    const model = activeModels.find((m) => m.id === modelId) ?? null;
    setExplicitScope({
      modelId,
      // Un filtre dépôt/site n'a de sens que pour la nature du nouveau modèle.
      depotId: model?.nature === "stock_item" ? scope.depotId : null,
      site: model?.nature === "asset" ? scope.site : "",
      period: scope.period,
    });
    setSiteFieldVersion((v) => v + 1);
  }

  function applySavedDashboard(dashboard: SavedDashboardOut) {
    setExplicitScope({
      modelId: dashboard.model_definition_id,
      depotId: dashboard.depot_id,
      site: dashboard.site ?? "",
      period: dashboard.period,
    });
    setSiteFieldVersion((v) => v + 1);
  }

  const periodLabel = PERIOD_LABELS[scope.period];

  if (pinnedQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Bonjour {firstName}</h1>
        {currentOrganization ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{currentOrganization.name}</span>
            <span aria-hidden>·</span>
            <span>{ROLE_LABELS[currentOrganization.my_role]}</span>
            <span aria-hidden>·</span>
            <span>Essai jusqu&apos;au {formatDate(currentOrganization.trial_ends_at)}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/40 p-4 ring-1 ring-foreground/5 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ModelPicker models={activeModels} selectedModelId={scope.modelId} onSelect={selectModel} />
          <div className="flex flex-wrap items-center gap-2">
            {isCurrentScopePinned ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Pin className="size-3" />
                Page d&apos;accueil
              </span>
            ) : null}
            <SavedDashboardsMenu
              organizationId={currentOrganizationId as string}
              accessToken={accessToken as string}
              onLoad={applySavedDashboard}
            />
            <SaveDashboardDialog
              organizationId={currentOrganizationId as string}
              accessToken={accessToken as string}
              scope={scope}
              onSaved={() =>
                queryClient.invalidateQueries({ queryKey: ["saved-dashboards", currentOrganizationId] })
              }
              trigger={
                <Button variant="outline" size="sm">
                  <Save className="size-3.5" />
                  Enregistrer
                </Button>
              }
            />
          </div>
        </div>

        {focusedModel ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
            {focusedModel.nature === "stock_item" ? (
              <Select
                value={scope.depotId ?? "all"}
                onValueChange={(v) => setExplicitScope({ ...scope, depotId: v === "all" ? null : v })}
              >
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue placeholder="Tous les dépôts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les dépôts</SelectItem>
                  {(depotsQuery.data ?? []).map((depot) => (
                    <SelectItem key={depot.id} value={depot.id}>
                      {depot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {focusedModel.nature === "asset" ? (
              // Non contrôlé + `key` : évite de recopier `scope.site` dans un
              // état local à chaque frappe (voir `handleSiteInputChange`). La
              // clé force une réinitialisation propre quand le site change
              // pour une raison EXTÉRIEURE à la saisie (changement de modèle,
              // chargement d'un tableau de bord enregistré).
              <Input
                key={siteFieldVersion}
                defaultValue={scope.site}
                onChange={(e) => handleSiteInputChange(e.target.value)}
                placeholder="Filtrer par site…"
                aria-label="Filtrer par site"
                className="h-8 w-48"
              />
            ) : null}
            <Select
              value={scope.period}
              onValueChange={(v) => setExplicitScope({ ...scope, period: v as DashboardPeriod })}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PERIOD_LABELS) as [DashboardPeriod, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {dashboardQuery.isError ? (
        <ErrorState
          message={dashboardQuery.error instanceof ApiError ? dashboardQuery.error.message : "Erreur inconnue."}
          onRetry={() => void dashboardQuery.refetch()}
        />
      ) : !dashboardQuery.data ? (
        <DashboardContentSkeleton />
      ) : dashboardQuery.data.attention && dashboardQuery.data.summary ? (
        <GlobalDashboardView
          attention={dashboardQuery.data.attention}
          summary={dashboardQuery.data.summary}
          currencyCode={currentOrganization?.currency_code ?? undefined}
          onOpenDrilldown={setDrilldown}
        />
      ) : dashboardQuery.data.asset ? (
        <AssetDashboardView
          data={dashboardQuery.data.asset}
          modelNamePlural={focusedModel?.name_plural ?? "Fiches"}
          currencyCode={currentOrganization?.currency_code ?? undefined}
          periodLabel={periodLabel}
          onOpenDrilldown={setDrilldown}
        />
      ) : dashboardQuery.data.stock ? (
        <StockDashboardView
          data={dashboardQuery.data.stock}
          currencyCode={currentOrganization?.currency_code ?? undefined}
          periodLabel={periodLabel}
          onOpenDrilldown={setDrilldown}
        />
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="Rien à afficher"
          description="Ce modèle n'a pas encore de données à synthétiser."
        />
      )}

      <DrilldownDialog
        open={drilldown !== null}
        onOpenChange={(open) => {
          if (!open) setDrilldown(null);
        }}
        kind={drilldown}
        organizationId={currentOrganizationId as string}
        accessToken={accessToken as string}
        modelId={scope.modelId}
        depotId={scope.depotId}
        site={scope.site}
      />
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <DashboardContentSkeleton />
    </div>
  );
}

function DashboardContentSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
